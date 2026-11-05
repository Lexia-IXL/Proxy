const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Host static visual assets from the public asset folder
app.use(express.static(path.join(__dirname, 'public')));

// Intercept routing logic from search endpoint parameter
app.use('/service/:targetUrl*', (req, res, next) => {
    // Decodes path string parameters natively matching the frontend structure engine
    let targetParam = req.params.targetUrl;
    
    try {
        let decodedTarget = decodeURIComponent(targetParam);
        
        if (!/^https?:\/\//i.test(decodedTarget)) {
            decodedTarget = 'https://' + decodedTarget;
        }

        const parsedUrl = new URL(decodedTarget);
        const targetOrigin = parsedUrl.origin;

        const proxy = createProxyMiddleware({
            target: targetOrigin,
            changeOrigin: true,
            followRedirects: true,
            secure: true,
            on: {
                proxyReq: (proxyReq, req, res) => {
                    proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
                    proxyReq.setHeader('Referer', targetOrigin);
                    proxyReq.setHeader('Origin', targetOrigin);
                },
                proxyRes: (proxyRes, req, res) => {
                    delete proxyRes.headers['content-security-policy'];
                    delete proxyRes.headers['content-security-policy-report-only'];
                    delete proxyRes.headers['x-frame-options'];
                    
                    proxyRes.headers['Access-Control-Allow-Origin'] = '*';
                    proxyRes.headers['Access-Control-Allow-Headers'] = '*';
                },
                error: (err, req, res) => {
                    if (!res.headersSent) {
                        res.status(500).json({ error: 'Proxy Request Mismatch', details: err.message });
                    }
                }
            },
            pathRewrite: (rawPath, req) => {
                // Strips service prefixes safely to balance target path parameters
                return rawPath.replace(/^\/service\/[^/]+/, '') || '/';
            }
        });

        proxy(req, res, next);
    } catch (e) {
        return res.status(400).json({ error: 'Failed compiling structural URL string parameters.' });
    }
});

// Default path fallback to native frontend index
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Proxy running on port ${PORT}`);
});
