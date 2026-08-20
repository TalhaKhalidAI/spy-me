import { z } from 'zod';

export const updateUserSchema = z.object({
    username: z.string().min(3).optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    avatar: z.string().url().optional(),
});
