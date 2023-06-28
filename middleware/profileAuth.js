const jwt = require('jsonwebtoken');
module.exports = function (req, res, next) {
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!("authorization" in req.headers)) {
        next();
        return
    } else if (!req.headers.authorization.match(/^Bearer /)) {
        res.status(401).json({ error: true, message: "Authorization header is malformed"})
        return
    }
    const token = req.headers.authorization.replace(/^Bearer /, "");
    try {
        //WORKAROUND jwt doesn't throw TokenExpiredError
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
