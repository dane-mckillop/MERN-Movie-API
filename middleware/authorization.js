const jwt = require('jsonwebtoken');
module.exports = function (req, res, next) {
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!("authorization" in req.headers)
        || !req.headers.authorization.match(/^Bearer /)
    ) {
        res.status(401).json({ error: true, message: "Authorization header ('Bearer token') not found" });
        return;
    }
    const token = req.headers.authorization.replace(/^Bearer /, "");
    try {
        // WORKAROUND later discovered should assign exp: bearerExp.
        // NOTE: exp: someToken still doesn't work as intended. Keep workaround.
        const result = jwt.verify(token, process.env.JWT_SECRET);
        const now = Math.floor(Date.now() / 1000);
        if ((result.bearerExp - now) < 0) {
            throw new jwt.TokenExpiredError();
        }
    } catch (e) {
        if (e.name === "TokenExpiredError") {
            res.status(401).json({ error: true, message: "JWT token has expired" });
        } else {
            res.status(401).json({ error: true, message: "Invalid JWT token" });
        }
        return;
    }

    next();
};
