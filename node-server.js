#!/usr/bin/env node
/**
 * Node.js TRX Sender - HTTP Server for Render.com
 */

const http = require('http');
const TronWeb = require('tronweb');

// Configuration from environment variables
const MASTER_WALLET_PRIVATE_KEY = process.env.TRON_PRIVATE_KEY;
const TRONGRID_API = 'https://api.trongrid.io';
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
            const { to_address, amount } = data;
            
            // Validate
            if (!to_address || !amount) {
                res.writeHead(400);
                res.end(JSON.stringify({
                    success: false,
                    error: 'Missing to_address or amount'
                }));
                return;
            }
            
            if (!tronWeb.isAddress(to_address)) {
                res.writeHead(400);
                res.end(JSON.stringify({
                    success: false,
                    error: 'Invalid recipient address'
                }));
                return;
            }
            
            const amountInTRX = parseFloat(amount);
            if (isNaN(amountInTRX) || amountInTRX <= 0) {
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
            
            // Check balance
            const balance = await tronWeb.trx.getBalance(fromAddress);
            if (balance < amountInSun) {
                res.writeHead(400);
                res.end(JSON.stringify({
                    success: false,
                    error: 'Insufficient balance in master wallet'
                }));
                return;
            }
            
            // Send transaction
            const transaction = await tronWeb.trx.sendTransaction(
                to_address,
                amountInSun
            );
            
            if (transaction.result) {
                const txid = transaction.txid || transaction.transaction.txID;
                console.log(`✅ Success! TX: ${txid}`);
                
                res.writeHead(200);
                res.end(JSON.stringify({
                    success: true,
                    txid: txid,
                    from: fromAddress,
                    to: to_address,
                    amount: amountInTRX,
                    tronscan_url: `https://tronscan.org/#/transaction/${txid}`
                }));
            } else {
                throw new Error('Transaction failed: ' + JSON.stringify(transaction));
            }
            
        } catch (error) {
            console.error('❌ Error:', error.message);
            res.writeHead(500);
            res.end(JSON.stringify({
                success: false,
                error: error.message || error.toString()
            }));
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
