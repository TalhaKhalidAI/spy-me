import argon2 from 'argon2';
import logger from '../api/utils/logger.js';

export class PasswordService {
    /**
     * Hashes a password using Argon2id.
     * @param {string} password - The plain text password.
     * @returns {Promise<string>} - The hashed password.
     */
    static async hash(password) {
        try {
            return await argon2.hash(password, {
                type: argon2.argon2id,
                memoryCost: 2 ** 16, // 64MB
                timeCost: 3,
                parallelism: 1,
            });
        } catch (error) {
            logger.error('Error hashing password:', error);
            throw new Error('Password hashing failed');
        }
    }

    /**
     * Verifies a password against a hash.
     * @param {string} hash - The hashed password.
     * @param {string} password - The plain text password.
     * @returns {Promise<boolean>} - True if verified, false otherwise.
     */
    static async verify(hash, password) {
        try {
            return await argon2.verify(hash, password);
        } catch (error) {
            logger.error('Error verifying password:', error);
            return false;
        }
    }
}

export default PasswordService;
