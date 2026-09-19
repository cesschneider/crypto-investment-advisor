#!/usr/bin/env node

const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load .env
const envPath = '/root/projects/crypto-investment-advisor/.env';
dotenv.config({ path: envPath });

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;

if (!ETHERSCAN_API_KEY) {
  console.error('❌ ETHERSCAN_API_KEY not found in .env');
  process.exit(1);
}

console.log('🔍 Testing Etherscan API Credentials...\n');
console.log(`API Key: ${ETHERSCAN_API_KEY.substring(0, 10)}...${ETHERSCAN_API_KEY.substring(ETHERSCAN_API_KEY.length - 8)}`);
console.log('');

async function testEtherscan() {
  console.log('📌 Test 1: Get Ethereum gas prices...');
  try {
    const response = await axios.get('https://api.etherscan.io/api', {
      params: {
        module: 'gastracker',
        action: 'gasoracle',
        apikey: ETHERSCAN_API_KEY
      }
    });
    
    if (response.data.status === '1') {
      console.log('✅ Etherscan API is working!');
      console.log(`   Status: ${response.data.status}`);
      console.log(`   Safe gas price: ${response.data.result.SafeGasPrice} Gwei`);
      console.log(`   Standard gas: ${response.data.result.StandardGasPrice} Gwei`);
      console.log(`   Fast gas: ${response.data.result.FastGasPrice} Gwei`);
      return true;
    } else {
      console.log('❌ API returned error:');
      console.log(`   Message: ${response.data.message}`);
      return false;
    }
  } catch (error) {
    console.log('❌ API Error:', error.message);
    return false;
  }
}

async function testAccountBalance() {
  console.log('\n📌 Test 2: Get account balance...');
  try {
    // Use a known whale address
    const response = await axios.get('https://api.etherscan.io/api', {
      params: {
        module: 'account',
        action: 'balance',
        address: '0x1F573D6Fb3F13d689FF844B4cE37794d79a7FF1C', // Uniswap
        apikey: ETHERSCAN_API_KEY
      }
    });
    
    if (response.data.status === '1') {
      console.log('✅ Account lookup working!');
      const balance = response.data.result;
      const ethBalance = parseFloat(balance) / 1e18;
      console.log(`   Uniswap balance: ${ethBalance.toFixed(2)} ETH`);
      return true;
    } else {
      console.log('❌ Account lookup failed:');
      console.log(`   Message: ${response.data.message}`);
      return false;
    }
  } catch (error) {
    console.log('❌ API Error:', error.message);
    return false;
  }
}

async function runTests() {
  console.log('══════════════════════════════════════════════════════════════');
  console.log('ETHERSCAN API VALIDATION TEST SUITE');
  console.log('══════════════════════════════════════════════════════════════\n');
  
  const test1 = await testEtherscan();
  const test2 = await testAccountBalance();
  
  console.log('\n' + '═'.repeat(70));
  console.log('TEST SUMMARY');
  console.log('═'.repeat(70));
  
  const passed = [test1, test2].filter(x => x).length;
  const total = 2;
  
  console.log(`Tests passed: ${passed}/${total}`);
  
  if (test1) {
    console.log('✅ STATUS: Etherscan API credentials are VALID and working');
    console.log('   Ready for production use');
    process.exit(0);
  } else {
    console.log('❌ STATUS: Etherscan API credentials are INVALID or not working');
    process.exit(1);
  }
}

runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
