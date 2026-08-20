// src/pages/Login/index.tsx

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLoginMutation } from './query';
import { useAuthStore } from '../../store/authStore'; // ✅ ADD THIS
import {
  Box,
  Button,
  TextField,
  Typography,
  Container,
  Paper,
  InputAdornment,
  IconButton,
  Fade,
  Alert,
  CircularProgress,
  Divider,
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import {
  LockOutlined as LockIcon,
  Visibility,
  VisibilityOff,
  PersonOutline as PersonIcon,
  Google,
  GitHub,
} from '@mui/icons-material';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'react-toastify';

// ============================================================
// SCHEMA
// ============================================================

const loginSchema = z.object({
  username: z
    .string()
    .min(1, 'Username is required')
    .min(3, 'Username must be at least 3 characters'),
  password: z
    .string()
    .min(1, 'Password is required')
    .min(6, 'Password must be at least 6 characters'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

// ============================================================
// COMPONENT
// ============================================================

function Login() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const setAuth = useAuthStore((state) => state.setAuth);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: '',
      password: '',
    },
  });

  const loginMutation = useLoginMutation();

  const onSubmit = (data: LoginFormValues) => {
    loginMutation.mutate({
      username: data.username,
      password: data.password,
    });
  };

  useEffect(() => {
    if (loginMutation.isSuccess && loginMutation.data) {
      const { user } = loginMutation.data;
      const u = (user || {}) as any;
      
      console.log('✅ Login success via cookie');
      
      setAuth({
        id: String(u.id || u.user_id || ''),
        email: u.email || '',
        name: u.full_name || u.username || u.name || '',
      });
      
      toast.success(`Welcome ${u.full_name || u.username || 'back'}!`);
      
      setTimeout(() => {
        navigate('/talha/webrtc');
      }, 100);
    }
  }, [loginMutation.isSuccess, loginMutation.data, navigate, setAuth]);

  // Handle error
  useEffect(() => {
    if (loginMutation.isError) {
      const errorMessage = loginMutation.error?.response?.data?.detail || 'Invalid credentials';
      setError('root', { message: errorMessage });
    }
  }, [loginMutation.isError, loginMutation.error, setError]);

  const rootError = errors.root?.message || '';

  const handleSocialLogin = (provider: 'google' | 'github') => {
    console.log(`Logging in with ${provider}`);
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        minWidth: '100vw',
        background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 2,
        margin: 0,
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        style={{ width: '100%', maxWidth: '450px' }}
      >
        <Container maxWidth="sm" disableGutters>
          <Paper
            elevation={24}
            sx={{
              p: { xs: 3, sm: 4, md: 5 },
              borderRadius: 4,
              background: 'rgba(255, 255, 255, 0.05)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              overflow: 'hidden',
              position: 'relative',
              width: '100%',
              boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5)',
            }}
          >
            {/* Decorative glow elements */}
            <Box
              sx={{
                position: 'absolute',
                top: -100,
                right: -100,
                width: 300,
                height: 300,
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(102, 126, 234, 0.3), transparent 70%)',
                opacity: 0.6,
              }}
            />
            <Box
              sx={{
                position: 'absolute',
                bottom: -100,
                left: -100,
                width: 250,
                height: 250,
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(118, 75, 162, 0.3), transparent 70%)',
                opacity: 0.6,
              }}
            />

            {/* Logo/Header */}
            <Box sx={{ textAlign: 'center', mb: 4, position: 'relative', zIndex: 1 }}>
              <motion.div
                whileHover={{ scale: 1.05 }}
                transition={{ type: "spring", stiffness: 400, damping: 10 }}
              >
                <Box
                  sx={{
                    width: 60,
                    height: 60,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    mb: 2,
                    boxShadow: '0 4px 30px rgba(102, 126, 234, 0.4)',
                  }}
                >
                  <LockIcon sx={{ fontSize: 32, color: 'white' }} />
                </Box>
              </motion.div>

              <Typography
                variant="h4"
                component="h1"
                sx={{
                  fontWeight: 700,
                  color: '#ffffff',
                  mb: 1,
                }}
              >
                Welcome Back
              </Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                Sign in to your account to continue
              </Typography>
            </Box>

            {/* Login Form */}
            <Fade in={true}>
              <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ position: 'relative', zIndex: 1 }}>
                {rootError && (
                  <Alert
                    severity="error"
                    sx={{
                      mb: 3,
                      borderRadius: 2,
                      '& .MuiAlert-icon': { alignItems: 'center' },
                      background: 'rgba(244, 67, 54, 0.15)',
                      color: '#ef5350',
                      border: '1px solid rgba(244, 67, 54, 0.2)',
                    }}
                  >
                    {rootError}
                  </Alert>
                )}

                {/* Username Field */}
                <TextField
                  fullWidth
                  label="Username"
                  {...register('username')}
                  error={!!errors.username}
                  helperText={errors.username?.message}
                  sx={{
                    mb: 3,
                    '& .MuiOutlinedInput-root': {
                      color: '#ffffff',
                      '& fieldset': {
                        borderColor: 'rgba(255, 255, 255, 0.2)',
                      },
                      '&:hover fieldset': {
                        borderColor: 'rgba(255, 255, 255, 0.3)',
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: '#667eea',
                      },
                    },
                    '& .MuiInputLabel-root': {
                      color: 'rgba(255, 255, 255, 0.6)',
                    },
                    '& .MuiInputLabel-root.Mui-focused': {
                      color: '#667eea',
                    },
                    '& .MuiFormHelperText-root': {
                      color: 'rgba(255, 255, 255, 0.6)',
                    },
                    '& .MuiFormHelperText-root.Mui-error': {
                      color: '#ef5350',
                    },
                  }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <PersonIcon sx={{ color: 'rgba(255, 255, 255, 0.5)' }} />
                      </InputAdornment>
                    ),
                  }}
                  placeholder="Enter your username"
                  variant="outlined"
                  size="medium"
                  disabled={loginMutation.isPending}
                />

                {/* Password Field */}
                <TextField
                  fullWidth
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  {...register('password')}
                  error={!!errors.password}
                  helperText={errors.password?.message}
                  sx={{
                    mb: 2,
                    '& .MuiOutlinedInput-root': {
                      color: '#ffffff',
                      '& fieldset': {
                        borderColor: 'rgba(255, 255, 255, 0.2)',
                      },
                      '&:hover fieldset': {
                        borderColor: 'rgba(255, 255, 255, 0.3)',
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: '#667eea',
                      },
                    },
                    '& .MuiInputLabel-root': {
                      color: 'rgba(255, 255, 255, 0.6)',
                    },
                    '& .MuiInputLabel-root.Mui-focused': {
                      color: '#667eea',
                    },
                    '& .MuiFormHelperText-root': {
                      color: 'rgba(255, 255, 255, 0.6)',
                    },
                    '& .MuiFormHelperText-root.Mui-error': {
                      color: '#ef5350',
                    },
                  }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <LockIcon sx={{ color: 'rgba(255, 255, 255, 0.5)' }} />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowPassword(!showPassword)}
                          edge="end"
                          sx={{ color: 'rgba(255, 255, 255, 0.5)' }}
                        >
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                  placeholder="••••••••"
                  variant="outlined"
                  size="medium"
                  disabled={loginMutation.isPending}
                />

                {/* Remember Me & Forgot Password */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        size="small"
                        sx={{
                          color: 'rgba(255, 255, 255, 0.3)',
                          '&.Mui-checked': {
                            color: '#667eea',
                          },
                        }}
                      />
                    }
                    label={
                      <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                        Remember me
                      </Typography>
                    }
                  />
                  <Button
                    variant="text"
                    size="small"
                    sx={{
                      textTransform: 'none',
                      fontWeight: 500,
                      color: '#667eea',
                      '&:hover': {
                        background: 'rgba(102, 126, 234, 0.15)',
                      },
                    }}
                  >
                    Forgot password?
                  </Button>
                </Box>

                {/* Submit Button */}
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button
                    fullWidth
                    type="submit"
                    disabled={loginMutation.isPending}
                    sx={{
                      py: 1.5,
                      borderRadius: 2,
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      color: 'white',
                      fontWeight: 600,
                      fontSize: '1rem',
                      textTransform: 'none',
                      boxShadow: '0 4px 20px rgba(102, 126, 234, 0.3)',
                      '&:hover': {
                        background: 'linear-gradient(135deg, #5a6fd8 0%, #6a4190 100%)',
                        boxShadow: '0 6px 25px rgba(102, 126, 234, 0.4)',
                      },
                      '&:disabled': {
                        background: 'rgba(255, 255, 255, 0.1)',
                        color: 'rgba(255, 255, 255, 0.3)',
                      },
                    }}
                  >
                    {loginMutation.isPending ? (
                      <CircularProgress size={24} sx={{ color: 'white' }} />
                    ) : (
                      'Sign In'
                    )}
                  </Button>
                </motion.div>

                {/* Divider */}
                <Box sx={{ my: 4, position: 'relative' }}>
                  <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                    <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.4)', px: 2 }}>
                      Or continue with
                    </Typography>
                  </Divider>
                </Box>

                {/* Social Login Buttons */}
                <Box sx={{ display: 'flex', gap: 2, mb: 4 }}>
                  <Button
                    fullWidth
                    variant="outlined"
                    onClick={() => handleSocialLogin('google')}
                    sx={{
                      py: 1.5,
                      borderRadius: 2,
                      textTransform: 'none',
                      fontWeight: 500,
                      borderColor: 'rgba(255, 255, 255, 0.15)',
                      color: 'rgba(255, 255, 255, 0.8)',
                      '&:hover': {
                        borderColor: 'rgba(255, 255, 255, 0.3)',
                        background: 'rgba(255, 255, 255, 0.05)',
                      },
                    }}
                    startIcon={<Google />}
                  >
                    Google
                  </Button>
                  <Button
                    fullWidth
                    variant="outlined"
                    onClick={() => handleSocialLogin('github')}
                    sx={{
                      py: 1.5,
                      borderRadius: 2,
                      textTransform: 'none',
                      fontWeight: 500,
                      borderColor: 'rgba(255, 255, 255, 0.15)',
                      color: 'rgba(255, 255, 255, 0.8)',
                      '&:hover': {
                        borderColor: 'rgba(255, 255, 255, 0.3)',
                        background: 'rgba(255, 255, 255, 0.05)',
                      },
                    }}
                    startIcon={<GitHub />}
                  >
                    GitHub
                  </Button>
                </Box>

                {/* Sign Up Link */}
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                    Don't have an account?{' '}
                    <Button
                      variant="text"
                      size="small"
                      onClick={() => navigate('/signup')}
                      sx={{
                        textTransform: 'none',
                        fontWeight: 600,
                        color: '#667eea',
                        '&:hover': {
                          background: 'rgba(102, 126, 234, 0.15)',
                        },
                      }}
                    >
                      Sign up now
                    </Button>
                  </Typography>
                </Box>
              </Box>
            </Fade>
          </Paper>
        </Container>
      </motion.div>
    </Box>
  );
}

export default Login;