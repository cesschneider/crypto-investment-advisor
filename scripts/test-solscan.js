#!/usr/bin/env node

const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');

// Load .env
const envPath = '/root/projects/crypto-investment-advisor/.env';
dotenv.config({ path: envPath });

const SOLSCAN_API_KEY = process.env.SOLSCAN_API_KEY;

if (!SOLSCAN_API_KEY) {
  console.error('❌ SOLSCAN_API_KEY not found in .env');
  process.exit(1);
}

console.log('🔍 Testing Solscan API Credentials...\n');
console.log(`API Key (JWT): ${SOLSCAN_API_KEY.substring(0, 30)}...${SOLSCAN_API_KEY.substring(SOLSCAN_API_KEY.length - 20)}`);
console.log('');

async function testSolscan() {
  console.log('📌 Test 1: Get SOL price (Market Data)...');
  try {
    const response = await axios.get('https://api-v2.solscan.io/market/price', {
      headers: {
        'Token': SOLSCAN_API_KEY
      }
    });
    
    if (response.data) {
      console.log('✅ Solscan API is working!');
      console.log(`   Status: Success`);
      console.log(`   SOL Price: $${response.data.price || 'N/A'}`);
      return true;
    } else {
      console.log('❌ Unexpected response');
      console.log(`   Response: ${JSON.stringify(response.data)}`);
      return false;
    }
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('❌ Authentication FAILED: Invalid API token');
      console.log(`   Error: ${error.response.data?.message || error.message}`);
    } else if (error.response?.status === 403) {
      console.log('❌ Access FORBIDDEN');
      console.log(`   Error: ${error.response.data?.message || error.message}`);
    } else {
      console.log('❌ API Error:', error.message);
    }
    return false;
  }
}

async function testTokenInfo() {
  console.log('\n📌 Test 2: Get Token Information (USDC on Solana)...');
  try {
    // USDC on Solana: EPjFWaJgt5DtA2Z5a6UYpfkJVp49ZK8qr8JJFKkGaGLg
    const response = await axios.get('https://api-v2.solscan.io/token/meta', {
      params: {
        tokenAddress: 'EPjFWaJgt5DtA2Z5a6UYpfkJVp49ZK8qr8JJFKkGaGLg'
      },
      headers: {
        'Token': SOLSCAN_API_KEY
      }
    });
    
    if (response.data) {
      console.log('✅ Token info lookup working!');
      console.log(`   Token: ${response.data.name || 'N/A'}`);
      console.log(`   Symbol: ${response.data.symbol || 'N/A'}`);
      console.log(`   Decimals: ${response.data.decimals || 'N/A'}`);
      return true;
    } else {
      console.log('❌ Token lookup failed');
      return false;
    }
  } catch (error) {
    console.log('❌ API Error:', error.message);
    return false;
  }
}

async function runTests() {
  console.log('══════════════════════════════════════════════════════════════');
  console.log('SOLSCAN API VALIDATION TEST SUITE');
  console.log('══════════════════════════════════════════════════════════════\n');
  
  const test1 = await testSolscan();
  const test2 = await testTokenInfo();
  
  console.log('\n' + '═'.repeat(70));
  console.log('TEST SUMMARY');
  console.log('═'.repeat(70));
  
  const passed = [test1, test2].filter(x => x).length;
  const total = 2;
  
  console.log(`Tests passed: ${passed}/${total}`);
  
  if (test1) {
    console.log('✅ STATUS: Solscan API credentials are VALID and working');
    console.log('   Ready for production use');
    process.exit(0);
  } else {
    console.log('❌ STATUS: Solscan API credentials are INVALID or not working');
    process.exit(1);
  }
}

runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
