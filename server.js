const express = require('express');
const { createProxyMiddleware, responseInterceptor } = require('http-proxy-middleware');
const { parse } = require('node-html-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// 1. SEARCH ENGINE CONSOLE LOOKUP
app.get('/engine/lookup', (req, res) => {
    const query = req.query.q;
    const mode = req.query.mode || 'web';

    if (!query) return res.redirect('/');

    if (/^https?:\/\/[^\s$.?#].[^\s]*$/i.test(query.trim())) {
        return res.redirect(`/service/${encodeURIComponent(query.trim())}`);
    }

    if (mode === 'video' || query.toLowerCase().includes('youtube')) {
        const scrubbedTerms = encodeURIComponent(query.replace(/youtube/gi, '').trim());
        return res.redirect(`/service/${encodeURIComponent('https://yewtu.be' + scrubbedTerms)}`);
    } else {
        const scrubbedTerms = encodeURIComponent(query.trim());
        return res.redirect(`/service/${encodeURIComponent('https://duckduckgo.com' + scrubbedTerms)}`);
    }
});

// 2. REWRITING PROXY ENGINE WITH ACTIVE ERROR INTERCEPTION ALERT
app.use('/service/:targetUrl*', (req, res, next) => {
    let rawTarget = req.params.targetUrl;
    if (!rawTarget) return res.status(400).json({ error: 'Missing target URL context.' });

    try {
        let decodedTarget = decodeURIComponent(rawTarget);
        if (!/^https?:\/\//i.test(decodedTarget)) {
            decodedTarget = 'https://' + decodedTarget;
        }

        const parsedUrl = new URL(decodedTarget);
        const targetOrigin = parsedUrl.origin;
        const serverHostBase = `${req.protocol}://${req.get('host')}/service/`;

        const proxyEngine = createProxyMiddleware({
            target: targetOrigin,
            changeOrigin: true,
            followRedirects: true,
            secure: true,
            selfHandleResponse: true,

            on: {
                proxyReq: (proxyReq, req, res) => {
                    proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');
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
                        const domRoot = parse(htmlContent);

                        const injectProxyPath = (originalPath) => {
                            if (!originalPath || originalPath.startsWith('javascript:') || originalPath.startsWith('#') || originalPath.startsWith('data:')) return originalPath;
                            try {
                                const absoluteTargetUrl = new URL(originalPath, targetOrigin).href;
                                return serverHostBase + encodeURIComponent(absoluteTargetUrl);
                            } catch (err) {
                                return originalPath;
                            }
                        };

                        domRoot.querySelectorAll('a').forEach(el => el.setAttribute('href', injectProxyPath(el.getAttribute('href'))));
                        domRoot.querySelectorAll('script').forEach(el => el.setAttribute('src', injectProxyPath(el.getAttribute('src'))));
                        domRoot.querySelectorAll('link').forEach(el => el.setAttribute('href', injectProxyPath(el.getAttribute('href'))));
                        domRoot.querySelectorAll('img').forEach(el => el.setAttribute('src', injectProxyPath(el.getAttribute('src'))));
                        domRoot.querySelectorAll('form').forEach(el => el.setAttribute('action', injectProxyPath(el.getAttribute('action'))));
                        domRoot.querySelectorAll('iframe').forEach(el => el.setAttribute('src', injectProxyPath(el.getAttribute('src'))));

                        return domRoot.toString();
                    }
                    return responseBuffer;
                }),
                error: (err, req, res) => {
                    console.error("Proxy routing layer failure:", err.message);
                    
                    // Serve a dynamic script block if connection drops or targets are unreachable
                    if (!res.headersSent) {
                        res.setHeader('Content-Type', 'text/html');
                        res.status(200).send(`
                            <script>
                                alert("⚠️ Proxy Notice: The destination server is unreachable, down, or dropping traffic connections.");
                                window.location.href = "/";
                            </script>
                        `);
                    }
                }
            },
            pathRewrite: (processedPath, req) => {
                return processedPath.replace(/^\/service\/[^/]+/, '') || '/';
            }
        });

        proxyEngine(req, res, next);
    } catch (error) {
        return res.status(400).json({ error: 'Parsing runtime breakdown.' });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Production Portal Active on Port ${PORT}`);
});
