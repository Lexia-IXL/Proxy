const express = require('express');
const { createProxyMiddleware, responseInterceptor } = require('http-proxy-middleware');
const { parse } = require('node-html-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Host static assets safely from the public folder
app.use(express.static(path.join(__dirname, 'public')));

// 1. ENGINE SEARCH ROUTER - Decoupled query processor
app.get('/engine/search', (req, res) => {
    const query = req.query.q;
    const type = req.query.type || 'web';

    if (!query) {
        return res.redirect('/');
    }

    // Hand-off target to decentralized privacy routing matrices
    let targetRedirect = '';
    if (type === 'video' || query.toLowerCase().includes('youtube.com') || query.toLowerCase().includes('youtube')) {
        // Strip down query parameters to extract standard search indicators if present
        const searchTerms = query.replace(/https?:\/\/(www\.)?youtube\.com\/results\?search_query=/, '').replace(/https?:\/\/(www\.)?youtube\.com\//, '');
        // Route through high-speed decentralized open video index nodes
        targetRedirect = `/service/${encodeURIComponent('https://yewtu.be' + encodeURIComponent(searchTerms))}`;
    } else if (type === 'web') {
        // Route web requests via DuckDuckGo's lightweight, non-JS tracking template
        targetRedirect = `/service/${encodeURIComponent('https://duckduckgo.com' + encodeURIComponent(query))}`;
    }

    return res.redirect(targetRedirect);
});

// 2. REWRITING REVERSE PROXY CORE ENGINE
app.use('/service/:targetUrl*', (req, res, next) => {
    let targetParam = req.params.targetUrl;

    if (!targetParam) {
        return res.status(400).json({ error: 'Missing destination parameter.' });
    }

    try {
        let decodedTarget = decodeURIComponent(targetParam);
        if (!/^https?:\/\//i.test(decodedTarget)) {
            decodedTarget = 'https://' + decodedTarget;
        }

        const parsedUrl = new URL(decodedTarget);
        const targetOrigin = parsedUrl.origin;
        const proxyBaseUrl = `${req.protocol}://${req.get('host')}/service/`;

        const proxy = createProxyMiddleware({
            target: targetOrigin,
            changeOrigin: true,
            followRedirects: true,
            secure: true,
            selfHandleResponse: true, // Intercept to inject rewritten link targets

            on: {
                proxyReq: (proxyReq, req, res) => {
                    proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');
                    proxyReq.setHeader('Referer', targetOrigin);
                    proxyReq.setHeader('Origin', targetOrigin);
                    proxyReq.setHeader('Accept-Encoding', 'identity');
                },
                proxyRes: responseInterceptor(async (responseBuffer, proxyRes, req, res) => {
                    const contentType = proxyRes.headers['content-type'] || '';
                    
                    delete res.getHeaders()['content-security-policy'];
                    delete res.getHeaders()['content-security-policy-report-only'];
                    delete res.getHeaders()['x-frame-options'];
                    res.setHeader('Access-Control-Allow-Origin', '*');

                    if (contentType.includes('text/html')) {
                        let htmlContent = responseBuffer.toString('utf8');
                        const root = parse(htmlContent);

                        const convertToProxyPath = (urlStr) => {
                            if (!urlStr || urlStr.startsWith('javascript:') || urlStr.startsWith('#') || urlStr.startsWith('data:')) {
                                return urlStr;
                            }
                            try {
                                const absoluteUrl = new URL(urlStr, targetOrigin).href;
                                return proxyBaseUrl + encodeURIComponent(absoluteUrl);
                            } catch (e) {
                                return urlStr;
                            }
                        };

                        // Transform standard nodes to pass down recursively through our domain path layer
                        root.querySelectorAll('a').forEach(el => el.setAttribute('href', convertToProxyPath(el.getAttribute('href'))));
                        root.querySelectorAll('script').forEach(el => el.setAttribute('src', convertToProxyPath(el.getAttribute('src'))));
                        root.querySelectorAll('link').forEach(el => el.setAttribute('href', convertToProxyPath(el.getAttribute('href'))));
                        root.querySelectorAll('img').forEach(el => el.setAttribute('src', convertToProxyPath(el.getAttribute('src'))));
                        root.querySelectorAll('form').forEach(el => el.setAttribute('action', convertToProxyPath(el.getAttribute('action'))));

                        return root.toString();
                    }

                    return responseBuffer;
                }),
                error: (err, req, res) => {
                    if (!res.headersSent) {
                        res.status(500).json({ error: 'Proxy Node Timed Out', details: err.message });
                    }
                }
            },
            pathRewrite: (rawPath, req) => {
                return rawPath.replace(/^\/service\/[^/]+/, '') || '/';
            }
        });

        proxy(req, res, next);
    } catch (e) {
        return res.status(400).json({ error: 'Failed parsing parameters.' });
    }
});

// Direct catch-all routing fallback rules to primary interface
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Ultimate Proxy Portal operating on port ${PORT}`);
});
