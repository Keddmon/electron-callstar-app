import Store from 'electron-store';
import { z } from 'zod';

const settingsSchema = z.object({
    lastUsedPort: z.string().optional(),
    phoneIp: z.string().ipv4().optional(),
});

type Settings = z.infer<typeof settingsSchema>;

const store = new Store<Settings>({
    schema: settingsSchema.shape,
    defaults: {
        lastUsedPort: undefined,
        phoneIp: undefined,
    }
});