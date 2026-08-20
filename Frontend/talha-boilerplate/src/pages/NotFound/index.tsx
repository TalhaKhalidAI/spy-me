import { Box, Button, Typography, Container, Paper } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home as HomeIcon, Warning as WarningIcon } from '@mui/icons-material';

function NotFound() {
    const navigate = useNavigate();

    return (
        <Box
            sx={{
                minHeight: '100vh',
                background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                py: 4,
            }}
        >
            <Container maxWidth="md">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5 }}
                >
                    <Paper
                        elevation={24}
                        sx={{
                            p: { xs: 4, sm: 8 },
                            borderRadius: 8,
                            textAlign: 'center',
                            background: 'rgba(255, 255, 255, 0.9)',
                            backdropFilter: 'blur(20px)',
                            position: 'relative',
                            overflow: 'hidden',
                        }}
                    >
                        {/* Background floating circles */}
                        <Box
                            sx={{
                                position: 'absolute',
                                top: -100,
                                right: -100,
                                width: 300,
                                height: 300,
                                borderRadius: '50%',
                                background: 'linear-gradient(45deg, #667eea, #764ba2)',
                                opacity: 0.05,
                            }}
                        />

                        <motion.div
                            animate={{
                                rotate: [0, -5, 5, -5, 0],
                                y: [0, -10, 0]
                            }}
                            transition={{
                                duration: 4,
                                repeat: Infinity,
                                ease: "easeInOut"
                            }}
                        >
                            <WarningIcon
                                sx={{
                                    fontSize: 120,
                                    color: 'primary.main',
                                    mb: 4,
                                    filter: 'drop-shadow(0 10px 15px rgba(102, 126, 234, 0.3))'
                                }}
                            />
                        </motion.div>

                        <Typography
                            variant="h1"
                            sx={{
                                fontSize: { xs: '6rem', md: '10rem' },
                                fontWeight: 900,
                                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                backgroundClip: 'text',
                                WebkitBackgroundClip: 'text',
                                color: 'transparent',
                                lineHeight: 1,
                                mb: 2,
                            }}
                        >
                            404
                        </Typography>

                        <Typography variant="h4" fontWeight={700} gutterBottom sx={{ color: '#1a202c' }}>
                            Lost in Space?
                        </Typography>

                        <Typography variant="body1" color="text.secondary" sx={{ mb: 6, maxWidth: 500, mx: 'auto', fontSize: '1.1rem' }}>
                            The page you're looking for has moved to another galaxy or never existed in this dimension.
                        </Typography>

                        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
                            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                                <Button
                                    variant="contained"
                                    size="large"
                                    onClick={() => navigate('/')}
                                    startIcon={<HomeIcon />}
                                    sx={{
                                        px: 4,
                                        py: 1.5,
                                        borderRadius: 3,
                                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                        boxShadow: '0 10px 20px rgba(102, 126, 234, 0.3)',
                                        textTransform: 'none',
                                        fontWeight: 600,
                                        fontSize: '1.1rem',
                                        '&:hover': {
                                            background: 'linear-gradient(135deg, #5a6fd8 0%, #6a4190 100%)',
                                        }
                                    }}
                                >
                                    Back to Home
                                </Button>
                            </motion.div>

                            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                                <Button
                                    variant="outlined"
                                    size="large"
                                    onClick={() => navigate(-1)}
                                    sx={{
                                        px: 4,
                                        py: 1.5,
                                        borderRadius: 3,
                                        borderWidth: 2,
                                        textTransform: 'none',
                                        fontWeight: 600,
                                        fontSize: '1.1rem',
                                        '&:hover': {
                                            borderWidth: 2,
                                        }
                                    }}
                                >
                                    Go Back
                                </Button>
                            </motion.div>
                        </Box>
                    </Paper>
                </motion.div>
            </Container>
        </Box>
    );
}

export default NotFound;
