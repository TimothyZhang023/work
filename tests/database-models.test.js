import {
    createUser,
    createEndpointGroup,
    getEndpointGroups,
    updateEndpointGroup,
    setDefaultEndpointGroup,
    deleteEndpointGroup,
    getDefaultEndpointGroup,
    createApiKey,
    verifyApiKey,
    listApiKeys,
    revokeApiKey
} from '../server/models/database.js';

describe('Database Models - Endpoint Groups', () => {
    it('creates, reads, updates and deletes endpoint groups correctly', () => {
        const user = createUser(`user_${Date.now()}`, 'password123');

        const ep1 = createEndpointGroup(user.uid, 'Group 1', 'https://api.example.com', 'key-123', true, true);
        expect(ep1.id).toBeGreaterThan(0);
        expect(ep1.name).toBe('Group 1');

        const groups = getEndpointGroups(user.uid);
        expect(groups).toHaveLength(1);
        expect(groups[0].name).toBe('Group 1');
        expect(groups[0].api_key).toBe('key-123'); // Assert decryption works

        updateEndpointGroup(ep1.id, user.uid, 'Group 1 Updated', 'https://api.updated.com', 'key-456', false);

        let defaultGroup = getDefaultEndpointGroup(user.uid);
        expect(defaultGroup.name).toBe('Group 1 Updated');
        expect(defaultGroup.base_url).toBe('https://api.updated.com');
        expect(defaultGroup.api_key).toBe('key-456');
        expect(defaultGroup.use_preset_models).toBe(0);

        const ep2 = createEndpointGroup(user.uid, 'Group 2', 'https://api2.example.com', 'key-789', true, true);

        const allGroups = getEndpointGroups(user.uid);
        expect(allGroups).toHaveLength(2);

        defaultGroup = getDefaultEndpointGroup(user.uid);
        expect(defaultGroup.id).toBe(ep2.id);

        deleteEndpointGroup(ep1.id, user.uid);
        expect(getEndpointGroups(user.uid)).toHaveLength(1);
    });
});

describe('Database Models - API Keys', () => {
    it('handles API keys lifecycle', () => {
        const user = createUser(`user_${Date.now()}_api`, 'password123');

        const newKey = createApiKey(user.uid, 'My test key');
        expect(newKey.key.startsWith('timo-')).toBe(true);

        const keys = listApiKeys(user.uid);
        expect(keys).toHaveLength(1);
        expect(keys[0].name).toBe('My test key');
        expect(keys[0].is_active).toBe(1);

        const verifiedUid = verifyApiKey(newKey.key);
        expect(verifiedUid).toBe(user.uid);

        revokeApiKey(keys[0].id, user.uid);

        const keysAfterRevoke = listApiKeys(user.uid);
        expect(keysAfterRevoke[0].is_active).toBe(0);

        const failVerify = verifyApiKey(newKey.key);
        expect(failVerify).toBeNull();
    });
});
