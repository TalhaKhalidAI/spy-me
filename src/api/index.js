import express from 'express';
import v1Router from './routes/v1/index.js';

const router = express.Router();

// Versioning
router.use('/v1', v1Router);

// You can add v2 here in the future
// router.use('/v2', v2Router);

export default router;
