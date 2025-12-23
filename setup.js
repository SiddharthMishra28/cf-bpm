#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

function runCommand(command, description) {
  console.log(`\n🔧 ${description}...`);
  try {
    const result = execSync(command, { encoding: 'utf8', stdio: 'pipe' });
    console.log(`✅ ${description} completed successfully.`);
    return result;
  } catch (error) {
    console.log(`❌ Error during ${description}: ${error.message}`);
    throw error;
  }
}

async function main() {
  console.log('🚀 BPM Rule Engine Setup Wizard');
  console.log('================================');
  console.log('This wizard will help you set up all Cloudflare resources for the BPM Rule Engine.');
  console.log('');

  // Step 1: Check prerequisites
  console.log('📋 Step 1: Checking prerequisites...');
  try {
    execSync('wrangler --version', { stdio: 'pipe' });
    console.log('✅ Wrangler CLI is installed.');
  } catch (error) {
    console.log('❌ Wrangler CLI is not installed. Please install it first: npm install -g wrangler');
    process.exit(1);
  }

  try {
    execSync('node --version', { stdio: 'pipe' });
    console.log('✅ Node.js is installed.');
  } catch (error) {
    console.log('❌ Node.js is not installed.');
    process.exit(1);
  }

  // Step 2: Authenticate with Cloudflare
  console.log('\n📋 Step 2: Cloudflare Authentication');
  const authChoice = await ask('Do you need to login to Cloudflare? (y/n): ');
  if (authChoice.toLowerCase() === 'y' || authChoice.toLowerCase() === 'yes') {
    runCommand('wrangler auth login', 'Logging into Cloudflare');
  } else {
    console.log('⏭️  Skipping authentication (assuming already logged in).');
  }

  // Step 3: Create KV namespaces
  console.log('\n📋 Step 3: Creating KV Namespaces');

  // Create RULES_CACHE namespace
  console.log('Creating RULES_CACHE namespace...');
  let rulesCacheOutput = '';
  try {
    rulesCacheOutput = runCommand('wrangler kv:namespace create "RULES_CACHE"', 'Creating RULES_CACHE KV namespace');
  } catch (error) {
    // Check if it already exists
    try {
      const listOutput = execSync('wrangler kv:namespace list', { encoding: 'utf8' });
      const namespaces = JSON.parse(listOutput);
      const rulesCacheNs = namespaces.find(ns => ns.title === 'RULES_CACHE');
      if (rulesCacheNs) {
        console.log('✅ RULES_CACHE namespace already exists.');
        rulesCacheOutput = `id = "${rulesCacheNs.id}"`;
      } else {
        throw error;
      }
    } catch (listError) {
      console.log('❌ Could not create or find RULES_CACHE namespace. Please create it manually.');
      process.exit(1);
    }
  }

  // Create API_CACHE namespace
  console.log('Creating API_CACHE namespace...');
  let apiCacheOutput = '';
  try {
    apiCacheOutput = runCommand('wrangler kv:namespace create "API_CACHE"', 'Creating API_CACHE KV namespace');
  } catch (error) {
    // Check if it already exists
    try {
      const listOutput = execSync('wrangler kv:namespace list', { encoding: 'utf8' });
      const namespaces = JSON.parse(listOutput);
      const apiCacheNs = namespaces.find(ns => ns.title === 'API_CACHE');
      if (apiCacheNs) {
        console.log('✅ API_CACHE namespace already exists.');
        apiCacheOutput = `id = "${apiCacheNs.id}"`;
      } else {
        throw error;
      }
    } catch (listError) {
      console.log('❌ Could not create or find API_CACHE namespace. Please create it manually.');
      process.exit(1);
    }
  }

  // Step 4: Create D1 Database
  console.log('\n📋 Step 4: Creating D1 Database');
  let dbOutput = '';
  try {
    dbOutput = runCommand('wrangler d1 create bpm_rule_db', 'Creating D1 database');
  } catch (error) {
    console.log('❌ Could not create D1 database. Please create it manually.');
    process.exit(1);
  }

  // Parse the IDs from outputs
  const rulesCacheId = rulesCacheOutput.match(/id = "([^"]+)"/)?.[1] || 'kv_namespace_id_placeholder';
  const apiCacheId = apiCacheOutput.match(/id = "([^"]+)"/)?.[1] || 'bpm-cache';
  const dbId = dbOutput.match(/database_id = "([^"]+)"/)?.[1];

  if (!dbId) {
    console.log('❌ Could not parse database ID from output. Please check wrangler output.');
    process.exit(1);
  }

  // Step 5: Update wrangler.toml
  console.log('\n📋 Step 5: Updating wrangler.toml configuration');

  let wranglerToml = fs.readFileSync('wrangler.toml', 'utf8');

  // Update KV namespace IDs
  wranglerToml = wranglerToml.replace(
    /id = "kv_namespace_id_placeholder"/,
    `id = "${rulesCacheId}"`
  );
  wranglerToml = wranglerToml.replace(
    /id = "bpm-cache"/,
    `id = "${apiCacheId}"`
  );

  // Update D1 database ID
  wranglerToml = wranglerToml.replace(
    /database_id = "[^"]+"/,
    `database_id = "${dbId}"`
  );

  fs.writeFileSync('wrangler.toml', wranglerToml);
  console.log('✅ wrangler.toml updated with resource IDs.');

  // Step 6: Run migrations
  console.log('\n📋 Step 6: Running database migrations');

  const migrations = [
    '001_initial.sql',
    '002_audit.sql',
    '003_security.sql',
    '004_versioning.sql',
    '005_executions_v2.sql'
  ];

  for (const migration of migrations) {
    const migrationPath = path.join('migrations', migration);
    if (fs.existsSync(migrationPath)) {
      runCommand(`wrangler d1 execute bpm_rule_db --file=${migrationPath}`, `Running migration ${migration}`);
    } else {
      console.log(`⚠️  Migration file ${migration} not found, skipping.`);
    }
  }

  // Step 7: Deploy
  console.log('\n📋 Step 7: Deploying the application');
  const deployChoice = await ask('Do you want to deploy the application now? (y/n): ');
  if (deployChoice.toLowerCase() === 'y' || deployChoice.toLowerCase() === 'yes') {
    runCommand('wrangler deploy', 'Deploying the BPM Rule Engine');
    console.log('\n🎉 Setup completed successfully!');
    console.log('Your BPM Rule Engine API is now deployed and ready to use.');
    console.log('Check the deployment output above for your API endpoint URL.');
  } else {
    console.log('\n⏭️  Skipping deployment. You can deploy later with: wrangler deploy');
    console.log('🎉 Setup completed successfully!');
    console.log('All Cloudflare resources have been created and configured.');
  }

  rl.close();
}

main().catch((error) => {
  console.error('Setup failed:', error);
  rl.close();
  process.exit(1);
});
