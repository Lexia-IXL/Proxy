const express = require('express');
const { createProxyMiddleware, responseInterceptor } = require('http-proxy-middleware');
const { parse } = require('node-html-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Host our interactive user dashboard UI natively
app.use(express.static(path.join(__dirname, 'public')));

// Intercept routing logic via explicit proxy base endpoint
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
            selfHandleResponse: true, // Necessary to let our interceptor modify the HTML payload body

            on: {
                proxyReq: (proxyReq, req, res) => {
                    // Inject real device metadata profiles to mitigate request blocks
                    proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
                    proxyReq.setHeader('Referer', targetOrigin);
                    proxyReq.setHeader('Origin', targetOrigin);
                    
                    // Force the destination to return clean uncompressed text arrays if they support it
                    proxyReq.setHeader('Accept-Encoding', 'identity');
                },
                proxyRes: responseInterceptor(async (responseBuffer, proxyRes, req, res) => {
                    const contentType = proxyRes.headers['content-type'] || '';
                    
                    // Clean up cross-site constraints
                    delete res.getHeaders()['content-security-policy'];
                    delete res.getHeaders()['content-security-policy-report-only'];
                    delete res.getHeaders()['x-frame-options'];
                    res.setHeader('Access-Control-Allow-Origin', '*');

                    // ONLY parse and rewrite if the incoming stream is HTML data
                    if (contentType.includes('text/html')) {
                        let htmlContent = responseBuffer.toString('utf8');
                        const root = parse(htmlContent);

                        // Helper function to turn relative or absolute URLs into proxy-routed links
                        const convertToProxyPath = (urlStr) => {
                            if (!urlStr || urlStr.startsWith('javascript:') || urlStr.startsWith('#') || urlStr.startsWith('data:')) {
                                return urlStr;
                            }
                            try {
                                // Resolve relative URLs back to their full target destination origin
                                const absoluteUrl = new URL(urlStr, targetOrigin).href;
                                return proxyBaseUrl + encodeURIComponent(absoluteUrl);
                            } catch (e) {
                                return urlStr;
                            }
                        };

                        // Sweep and rewrite document anchors, scripts, stylesheets, and images
                        root.querySelectorAll('a').forEach(el => el.setAttribute('href', convertToProxyPath(el.getAttribute('href'))));
                        root.querySelectorAll('script').forEach(el => el.setAttribute('src', convertToProxyPath(el.getAttribute('src'))));
                        root.querySelectorAll('link').forEach(el => el.setAttribute('href', convertToProxyPath(el.getAttribute('href'))));
                        root.querySelectorAll('img').forEach(el => el.setAttribute('src', convertToProxyPath(el.getAttribute('src'))));
                        root.querySelectorAll('form').forEach(el => el.setAttribute('action', convertToProxyPath(el.getAttribute('action'))));

                        return root.toString();
                    }

                    // Leave standard audio/video chunks and stylesheets intact
                    return responseBuffer;
                }),
                error: (err, req, res) => {
                    if (!res.headersSent) {
                        res.status(500).json({ error: 'Proxy Gateway Mismatch', details: err.message });
                    }
                }
            },
            pathRewrite: (rawPath, req) => {
                // Strips the service handler prefix sequence cleanly out of data loops
                return rawPath.replace(/^\/service\/[^/]+/, '') || '/';
            }
        });

        proxy(req, res, next);
    } catch (e) {
        return res.status(400).json({ error: 'Failed processing destination string parameters.' });
    }
});

// Default fallback rule routing missing asset lookups to the main index layout
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Rewriting proxy server operating safely on port ${PORT}`);
});
