#!/usr/bin/env node
/**
 * Node.js TRX Sender - HTTP Server for Render.com
 */

const http = require('http');
const TronWeb = require('tronweb');
const https = require('https');

// Configuration from environment variables
const MASTER_WALLET_PRIVATE_KEY = process.env.TRON_PRIVATE_KEY;
const TRONGRID_API = 'https://api.trongrid.io';
const TRONSCAN_API_URL = 'https://apilist.tronscan.org/api';
const TRONSCAN_API_KEY = '0773c20b-2616-4af8-a9ce-2f478116d2d3';
const MASTER_WALLET_ADDRESS = 'TJ8Ck6SHJWNrSDiSuvF999tHsBWUomNCBv';
const MIN_DEPOSIT_TRX = 5;
const PORT = process.env.PORT || 8080;

// Initialize TronWeb
let tronWeb;
try {
    console.log('🚀 Starting TRX Sender Server...');
    console.log('📡 TronGrid API:', TRONGRID_API);
    console.log('🔑 Private Key exists:', !!MASTER_WALLET_PRIVATE_KEY);
    
    if (!MASTER_WALLET_PRIVATE_KEY) {
        throw new Error('TRON_PRIVATE_KEY environment variable not set');
    }
    
    tronWeb = new TronWeb({
        fullHost: TRONGRID_API,
        privateKey: MASTER_WALLET_PRIVATE_KEY
    });
    
    console.log('✅ TronWeb initialized');
    console.log('🔑 Wallet:', tronWeb.defaultAddress.base58);
} catch (error) {
    console.error('❌ TronWeb initialization failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
}

// Helper function to fetch from TronScan API
function fetchTronScanAPI(path) {
    return new Promise((resolve, reject) => {
        const url = new URL(TRONSCAN_API_URL + path);
        
        https.get(url, {
            headers: {
                'TRON-PRO-API-KEY': TRONSCAN_API_KEY
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

// Check deposit function
async function checkDeposit(walletAddress) {
    try {
        const url = `/transaction?address=${MASTER_WALLET_ADDRESS}&limit=50&start=0`;
        const response = await fetchTronScanAPI(url);
        
        if (!response.data || response.data.length === 0) {
            return { success: false, error: 'No transactions found' };
        }
        
        // Find transaction from wallet to master wallet
        const foundTx = response.data.find(tx => {
            return tx.ownerAddress && 
                   tx.toAddress &&
                   tx.ownerAddress.toLowerCase() === walletAddress.toLowerCase() &&
                   tx.toAddress.toLowerCase() === MASTER_WALLET_ADDRESS.toLowerCase() &&
                   tx.confirmed === true;
        });
        
        if (!foundTx) {
            return { success: false, error: 'No deposit found from your wallet' };
        }
        
        // Calculate amount
        let amountInSun = 0;
        if (foundTx.contractData && foundTx.contractData.amount) {
            amountInSun = foundTx.contractData.amount;
        } else if (foundTx.amount) {
            amountInSun = foundTx.amount;
        }
        
        const amountTRX = amountInSun / 1000000;
        
        if (amountTRX < MIN_DEPOSIT_TRX) {
            return { 
                success: false, 
                error: `Minimum deposit is ${MIN_DEPOSIT_TRX} TRX` 
            };
        }
        
        return {
            success: true,
            amount_trx: amountTRX,
            tx_hash: foundTx.hash,
            wallet_address: walletAddress
        };
        
    } catch (error) {
        console.error('Check deposit error:', error);
        return { success: false, error: error.message };
    }
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');
    
    // Handle OPTIONS (preflight)
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    // Health check - accept any GET request
    if (req.method === 'GET') {
        res.writeHead(200);
        res.end(JSON.stringify({
            status: 'ok',
            service: 'TRX Sender',
            wallet: tronWeb.defaultAddress.base58,
            timestamp: new Date().toISOString()
        }));
        return;
    }
    
    // Only accept POST for transactions
    if (req.method !== 'POST') {
        res.writeHead(405);
        res.end(JSON.stringify({ success: false, error: 'Method not allowed' }));
        return;
    }
    
    // Read request body
    let body = '';
    req.on('data', chunk => {
        body += chunk.toString();
    });
    
    req.on('end', async () => {
        try {
            const data = JSON.parse(body);
            const { action, to_address, amount, wallet_address } = data;
            
            // Check deposit action
            if (action === 'check_deposit') {
                if (!wallet_address) {
                    res.writeHead(400);
                    res.end(JSON.stringify({
                        success: false,
                        error: 'Missing wallet_address'
                    }));
                    return;
                }
                
                const result = await checkDeposit(wallet_address);
                res.writeHead(result.success ? 200 : 400);
                res.end(JSON.stringify(result));
                return;
            }
            
            // Send TRX action (existing code)
            if (!to_address || !amount) {
                console.log('❌ Missing parameters:', { to_address, amount });
                res.writeHead(400);
                res.end(JSON.stringify({
                    success: false,
                    error: 'Missing to_address or amount'
                }));
                return;
            }
            
            console.log('📝 Received TRX send request:', {
                action,
                to_address,
                amount,
                addressLength: to_address?.length,
                startsWithT: to_address?.startsWith('T'),
                addressTrimmed: to_address?.trim(),
                requestBody: JSON.stringify(data, null, 2)
            });
            
            // TRX wallet address validation - daha esnek
            if (!to_address || typeof to_address !== 'string') {
                console.log('❌ Address is empty or not string:', to_address);
                res.writeHead(400);
                res.end(JSON.stringify({
                    success: false,
                    error: 'Invalid recipient address format'
                }));
                return;
            }
            
            // TRX adresi T ile başlamalı ve 34 karakter olmalı
            const trimmedAddress = to_address.trim();
            if (!trimmedAddress.startsWith('T') || trimmedAddress.length !== 34) {
                console.log('❌ Invalid TRX address format:', {
                    address: trimmedAddress,
                    length: trimmedAddress.length,
                    startsWithT: trimmedAddress.startsWith('T')
                });
                res.writeHead(400);
                res.end(JSON.stringify({
                    success: false,
                    error: 'Invalid TRX wallet address format'
                }));
                return;
            }
            
            // TronWeb ile address validation
            try {
                const isValidAddress = tronWeb.isAddress(trimmedAddress);
                if (!isValidAddress) {
                    console.log('❌ TronWeb validation failed for address:', trimmedAddress);
                    res.writeHead(400);
                    res.end(JSON.stringify({
                        success: false,
                        error: 'Invalid TRX wallet address'
                    }));
                    return;
                }
                console.log('✅ Address validation passed:', trimmedAddress);
                // Temizlenmiş adresi kullan
                to_address = trimmedAddress;
            } catch (validationError) {
                console.log('❌ Address validation error:', validationError.message);
                res.writeHead(400);
                res.end(JSON.stringify({
                    success: false,
                    error: 'Invalid wallet address'
                }));
                return;
            }
            
            console.log('✅ Address format validation passed:', to_address);
            
            const amountInTRX = parseFloat(amount);
            console.log('💰 Amount validation:', {
                originalAmount: amount,
                parsedAmount: amountInTRX,
                isNaN: isNaN(amountInTRX),
                isPositive: amountInTRX > 0
            });
            
            if (isNaN(amountInTRX) || amountInTRX <= 0) {
                console.log('❌ Invalid amount:', amount);
                res.writeHead(400);
                res.end(JSON.stringify({
                    success: false,
                    error: 'Invalid amount'
                }));
                return;
            }
            
            // Send TRX
            console.log(`💸 Sending ${amountInTRX} TRX to ${to_address}...`);
            
            const amountInSun = tronWeb.toSun(amountInTRX);
            const fromAddress = tronWeb.defaultAddress.base58;
            
            console.log('🔢 Transaction details:', {
                from: fromAddress,
                to: to_address,
                amountTRX: amountInTRX,
                amountSun: amountInSun
            });
            
            // Check balance
            console.log('💳 Checking wallet balance...');
            const balance = await tronWeb.trx.getBalance(fromAddress);
            console.log('💰 Current balance:', {
                balanceSun: balance,
                balanceTRX: balance / 1000000,
                requiredSun: amountInSun,
                sufficient: balance >= amountInSun
            });
            
            if (balance < amountInSun) {
                console.log('❌ Insufficient balance');
                res.writeHead(400);
                res.end(JSON.stringify({
                    success: false,
                    error: 'Insufficient balance in master wallet'
                }));
                return;
            }
            
            // Send transaction with retry logic
            let transaction;
            let retryCount = 0;
            const maxRetries = 3;
            
            while (retryCount < maxRetries) {
                try {
                    console.log(`💸 Attempt ${retryCount + 1}: Sending ${amountInTRX} TRX to ${to_address}...`);
                    
                    transaction = await tronWeb.trx.sendTransaction(
                        to_address,
                        amountInSun
                    );
                    
                    console.log('📤 Transaction response:', {
                        result: transaction.result,
                        txid: transaction.txid || transaction.transaction?.txID,
                        code: transaction.code,
                        message: transaction.message
                    });
                    
                    if (transaction.result) {
                        console.log('✅ Transaction successful!');
                        break; // Success, exit retry loop
                    } else {
                        throw new Error('Transaction failed: ' + JSON.stringify(transaction));
                    }
                } catch (error) {
                    retryCount++;
                    console.error(`❌ Attempt ${retryCount} failed:`, error.message);
                    
                    if (retryCount >= maxRetries) {
                        throw error; // Final attempt failed
                    }
                    
                    // Wait before retry (exponential backoff)
                    const waitTime = Math.pow(2, retryCount) * 1000; // 2s, 4s, 8s
                    console.log(`⏳ Waiting ${waitTime}ms before retry...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }
            }
            
            if (transaction.result) {
                const txid = transaction.txid || transaction.transaction.txID;
                console.log(`✅ Success! TX: ${txid}`);
                
                const successResponse = {
                    success: true,
                    txid: txid,
                    from: fromAddress,
                    to: to_address,
                    amount: amountInTRX,
                    tronscan_url: `https://tronscan.org/#/transaction/${txid}`
                };
                
                console.log('📤 Sending success response:', successResponse);
                
                res.writeHead(200);
                res.end(JSON.stringify(successResponse));
            } else {
                console.log('❌ Transaction result is false');
                throw new Error('Transaction failed: ' + JSON.stringify(transaction));
            }
            
        } catch (error) {
            console.error('❌ Error occurred:', {
                message: error.message,
                stack: error.stack,
                name: error.name
            });
            
            // Handle specific error types
            let statusCode = 500;
            let errorMessage = error.message || error.toString();
            
            console.log('🔍 Error analysis:', {
                originalError: errorMessage,
                includes429: errorMessage.includes('429'),
                includesRateLimit: errorMessage.includes('Too Many Requests'),
                includesInsufficient: errorMessage.includes('insufficient'),
                includesBalance: errorMessage.includes('balance'),
                includesAddress: errorMessage.includes('address')
            });
            
            if (errorMessage.includes('429') || errorMessage.includes('Too Many Requests')) {
                statusCode = 429;
                errorMessage = 'Rate limit exceeded. Please try again in a few minutes.';
            } else if (errorMessage.includes('insufficient') || errorMessage.includes('balance')) {
                statusCode = 400;
                errorMessage = 'Insufficient balance in master wallet';
            } else if (errorMessage.includes('address')) {
                statusCode = 400;
                errorMessage = 'Invalid wallet address';
            }
            
            const errorResponse = {
                success: false,
                error: errorMessage,
                code: statusCode
            };
            
            console.log('📤 Sending error response:', errorResponse);
            
            res.writeHead(statusCode);
            res.end(JSON.stringify(errorResponse));
        }
    });
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ TRX Sender Server running on port ${PORT}`);
    console.log('🎯 Ready to process withdrawal requests...');
});

// Handle errors
server.on('error', (error) => {
    console.error('💥 Server error:', error);
    process.exit(1);
});
