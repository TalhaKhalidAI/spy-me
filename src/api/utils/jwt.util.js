import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';

export const generateToken = (payload, secret, expiresIn) => {
    return jwt.sign(payload, secret, { expiresIn });
};

export const generateAuthTokens = (user) => {
    const accessToken = generateToken(
        { sub: user.id, role: user.role },
        env.JWT_SECRET,
        env.JWT_EXPIRES_IN
    );

    const refreshToken = generateToken(
        { sub: user.id },
        env.JWT_REFRESH_SECRET,
        env.JWT_REFRESH_EXPIRES_IN
    );

    return { accessToken, refreshToken };
};

export const verifyToken = (token, secret) => {
    return jwt.verify(token, secret);
};
