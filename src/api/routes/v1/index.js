import express from 'express';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import permissionRoutes from './permission.routes.js';
import SFU_Router from './SFU_Router.js';
import roomRoutes from './room.routes.js';
 
const router = express.Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use("/sfu", SFU_Router);
router.use('/rooms', roomRoutes);
router.use('/permissions', permissionRoutes);
 
export default router;