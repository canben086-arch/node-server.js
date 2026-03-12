#!/usr/bin/env node
/**
 * Automatic TRX Sender
 * Usage: node send-trx.js <to_address> <amount_in_trx>
 */

const TronWeb = require('tronweb');

// Configuration - Use environment variable for security
const MASTER_WALLET_PRIVATE_KEY = process.env.TRON_PRIVATE_KEY || '';
const TRONGRID_API = 'https://api.trongrid.io';

// Validate private key is set
if (!MASTER_WALLET_PRIVATE_KEY) {
    console.error(JSON.stringify({
        success: false,
        error: 'TRON_PRIVATE_KEY environment variable not set'
    }));
    process.exit(1);
}

// Initialize TronWeb
const tronWeb = new TronWeb({
    fullHost: TRONGRID_API,
    privateKey: MASTER_WALLET_PRIVATE_KEY
});

// Get command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
    console.error('Usage: node send-trx.js <to_address> <amount_in_trx>');
    process.exit(1);
}

const toAddress = args[0];
const amountInTRX = parseFloat(args[1]);

// Validate inputs
if (!tronWeb.isAddress(toAddress)) {
    console.error(JSON.stringify({
        success: false,
        error: 'Invalid recipient address'
    }));
    process.exit(1);
}

if (isNaN(amountInTRX) || amountInTRX <= 0) {
    console.error(JSON.stringify({
        success: false,
        error: 'Invalid amount'
    }));
    process.exit(1);
}

// Send TRX
async function sendTRX() {
    try {
        // Convert TRX to Sun (1 TRX = 1,000,000 Sun)
        const amountInSun = tronWeb.toSun(amountInTRX);
        
        // Get sender address
        const fromAddress = tronWeb.defaultAddress.base58;
        
        // Check balance
        const balance = await tronWeb.trx.getBalance(fromAddress);
        if (balance < amountInSun) {
            throw new Error('Insufficient balance in master wallet');
        }
        
        // Send transaction
        const transaction = await tronWeb.trx.sendTransaction(
            toAddress,
            amountInSun
        );
        
        if (transaction.result) {
            // Success
            console.log(JSON.stringify({
                success: true,
                txid: transaction.txid || transaction.transaction.txID,
                from: fromAddress,
                to: toAddress,
                amount: amountInTRX,
                tronscan_url: `https://tronscan.org/#/transaction/${transaction.txid || transaction.transaction.txID}`
            }));
            process.exit(0);
        } else {
            throw new Error('Transaction failed: ' + JSON.stringify(transaction));
        }
        
    } catch (error) {
        console.error(JSON.stringify({
            success: false,
            error: error.message || error.toString()
        }));
        process.exit(1);
    }
}

// Run
sendTRX();
