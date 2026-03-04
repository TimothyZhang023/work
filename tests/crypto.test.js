import { encrypt, decrypt } from '../server/utils/crypto.js';

describe('Crypto Utility', () => {
    it('encrypts and decrypts text correctly', () => {
        const plainText = 'secret-api-key-12345!@#';
        const encryptedText = encrypt(plainText);

        expect(encryptedText).toBeDefined();
        expect(encryptedText).not.toBe(plainText);
        expect(encryptedText).toContain(':');

        const decryptedText = decrypt(encryptedText);
        expect(decryptedText).toBe(plainText);
    });

    it('handles empty or null values', () => {
        expect(encrypt('')).toBe('');
        expect(decrypt('')).toBe('');
        expect(encrypt(null)).toBeNull();
        expect(decrypt(null)).toBeNull();
    });

    it('returns original text if decrypting unencrypted string', () => {
        // A string without ':' is not encrypted by our logic
        expect(decrypt('plain_key_without_colon')).toBe('plain_key_without_colon');
    });
});
