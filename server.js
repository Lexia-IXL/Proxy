const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static interface assets
app.use(express.static(path.join(__dirname, 'public')));

// Dynamic reverse proxy engine
app.use('/service/:targetUrl*', (req, res, next) => {
    let rawTarget = req.params.targetUrl + (req.params[0] || '');
    
    // Support path resolution query patterns
    if (!rawTarget && req.query.url) {
        rawTarget = req.query.url;
    }

    if (!rawTarget) {
        return res.status(400).json({ error: 'Missing destination target URL parameter.' });
    }

    let targetBase = rawTarget;
    if (!/^https?:\/\//i.test(targetBase)) {
        targetBase = 'https://' + targetBase;
    }

    try {
        const parsedTarget = new URL(targetBase);
        const originUrl = parsedTarget.origin;

        const proxy = createProxyMiddleware({
            target: originUrl,
            changeOrigin: true,
            followRedirects: true,
            secure: true,
            on: {
                proxyReq: (proxyReq, req, res) => {
                    proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
                    proxyReq.setHeader('Accept-Language', 'en-US,en;q=0.9');
                    proxyReq.setHeader('Referer', originUrl);
                    proxyReq.setHeader('Origin', originUrl);
                },
                proxyRes: (proxyRes, req, res) => {
                    delete proxyRes.headers['content-security-policy'];
                    delete proxyRes.headers['content-security-policy-report-only'];
                    delete proxyRes.headers['x-frame-options'];
                    
                    proxyRes.headers['Access-Control-Allow-Origin'] = '*';
                    proxyRes.headers['Access-Control-Allow-Headers'] = '*';
                },
                error: (err, req, res) => {
                    console.error('Proxy Error:', err.message);
                    if (!res.headersSent) {
                        res.status(500).json({ error: 'Proxy route failure.', details: err.message });
                    }
                }
            },
            pathRewrite: (path, req) => {
                return path.replace(/^\/service\/[^/]+/, '');
            }
        });

        proxy(req, res, next);
    } catch (error) {
        return res.status(400).json({ error: 'Malformed target URL provided.' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Proxy web portal listening natively on port ${PORT}`);
});
