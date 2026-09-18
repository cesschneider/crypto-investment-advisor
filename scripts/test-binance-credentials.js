#!/usr/bin/env node

/**
 * Binance API Credentials Validator
 * Tests if Binance API keys are valid and have proper permissions
 */

const axios = require('axios');
const crypto = require('crypto');
const dotenv = require('dotenv');
const path = require('path');

// Load .env file
const envPath = path.join(__dirname, '..', '.env');
console.log(`Loading .env from: ${envPath}\n`);
dotenv.config({ path: envPath });

const API_KEY = process.env.BINANCE_API_KEY;
const SECRET_KEY = process.env.BINANCE_SECRET_KEY;

if (!API_KEY || !SECRET_KEY) {
  console.error('❌ ERROR: BINANCE_API_KEY or BINANCE_SECRET_KEY not found in .env');
  process.exit(1);
}

console.log('🔍 Testing Binance API Credentials...\n');
console.log(`API Key (masked): ${API_KEY.substring(0, 8)}...${API_KEY.substring(API_KEY.length - 8)}`);
console.log(`Secret Key (masked): ${SECRET_KEY.substring(0, 8)}...${SECRET_KEY.substring(SECRET_KEY.length - 8)}`);
console.log('');

// Test 1: Public endpoint (no signature needed)
async function testPublicEndpoint() {
  console.log('📌 Test 1: Public API Endpoint (No Auth)...');
  try {
    const response = await axios.get('https://api.binance.com/api/v3/time');
    console.log('✅ Public API accessible');
    console.log(`   Server time: ${new Date(response.data.serverTime).toISOString()}`);
    return true;
  } catch (error) {
    console.log('❌ Public API failed:', error.message);
    return false;
  }
}

// Test 2: Signed endpoint - Get account info
async function testSignedEndpoint() {
  console.log('\n📌 Test 2: Signed API Endpoint (Account Info)...');
  
  try {
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    
    // Create HMAC signature
    const signature = crypto
      .createHmac('sha256', SECRET_KEY)
      .update(queryString)
      .digest('hex');
    
    const response = await axios.get('https://api.binance.com/api/v3/account', {
      headers: {
        'X-MBX-APIKEY': API_KEY
      },
      params: {
        timestamp,
        signature
      }
    });
    
    console.log('✅ API credentials are VALID!');
    console.log(`   Account UID: ${response.data.accountId}`);
    console.log(`   Balances: ${response.data.balances.length} assets`);
    console.log(`   Can trade: ${!response.data.restrictions || response.data.restrictions.enableSpotTrading}`);
    
    // Show non-zero balances
    const nonZero = response.data.balances.filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0);
    if (nonZero.length > 0) {
      console.log('\n   Assets with balance:');
      nonZero.slice(0, 5).forEach(b => {
        const total = parseFloat(b.free) + parseFloat(b.locked);
        console.log(`     • ${b.asset}: ${total.toFixed(8)}`);
      });
      if (nonZero.length > 5) {
        console.log(`     ... and ${nonZero.length - 5} more`);
      }
    }
    
    return true;
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('❌ Authentication FAILED: Invalid API credentials');
      console.log(`   Error: ${error.response.data.msg}`);
    } else if (error.response?.status === 403) {
      console.log('❌ Access FORBIDDEN: IP not whitelisted or API restrictions');
      console.log(`   Error: ${error.response.data.msg}`);
    } else {
      console.log('❌ API Error:', error.message);
    }
    return false;
  }
}

// Test 3: Get market data (uses API key for rate limiting)
async function testMarketData() {
  console.log('\n📌 Test 3: Market Data with API Key...');
  try {
    const response = await axios.get('https://api.binance.com/api/v3/ticker/price', {
      headers: {
        'X-MBX-APIKEY': API_KEY
      },
      params: {
        symbol: 'BTCUSDT'
      }
    });
    
    console.log('✅ Market data accessible');
    console.log(`   BTC/USDT: $${response.data.price}`);
    return true;
  } catch (error) {
    console.log('❌ Market data failed:', error.message);
    return false;
  }
}

// Main test runner
async function runTests() {
  console.log('═'.repeat(70));
  console.log('BINANCE API VALIDATION TEST SUITE');
  console.log('═'.repeat(70));
  console.log('');
  
  const test1 = await testPublicEndpoint();
  const test2 = await testSignedEndpoint();
  const test3 = await testMarketData();
  
  console.log('\n' + '═'.repeat(70));
  console.log('TEST SUMMARY');
  console.log('═'.repeat(70));
  
  const passed = [test1, test2, test3].filter(x => x).length;
  const total = 3;
  
  console.log(`Tests passed: ${passed}/${total}`);
  
  if (test2) {
    console.log('✅ STATUS: Binance API credentials are VALID and working');
    console.log('   Ready for production use');
    process.exit(0);
  } else {
    console.log('❌ STATUS: Binance API credentials are INVALID');
    console.log('   Please check your API key and secret');
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
