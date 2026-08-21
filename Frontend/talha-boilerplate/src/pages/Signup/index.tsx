// src/pages/Signup/index.tsx

import { useState, useEffect } from 'react';
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
  Grid,
  Link,
} from '@mui/material';
import {
  PersonOutline as PersonIcon,
  EmailOutlined as EmailIcon,
  LockOutlined as LockIcon,
  Visibility,
  VisibilityOff,
  BadgeOutlined as BadgeIcon,
} from '@mui/icons-material';
import { motion } from 'framer-motion';
import { useTheme } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useSignupMutation } from './query';
import { toast } from 'react-toastify';

// ============================================================
// SCHEMA - Matches API expectations
// ============================================================

const signupSchema = z.object({
  full_name: z
    .string()
    .min(2, 'Full name must be at least 2 characters')
    .max(100, 'Full name must be at most 100 characters'),
  
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(50, 'Username must be at most 50 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address'),
  
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters')
    .max(100, 'Password must be at most 100 characters'),
});

type SignupFormValues = z.infer<typeof signupSchema>;

// ============================================================
// COMPONENT
// ============================================================

function Signup() {
  const theme = useTheme();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      full_name: '',
      username: '',
      email: '',
      password: '',
    },
  });

  const signupMutation = useSignupMutation();

  // ✅ Handle success
  useEffect(() => {
    if (signupMutation.isSuccess && signupMutation.data) {
      const { user } = signupMutation.data;
      
      toast.success(`Welcome ${user.full_name}! Please login.`);
      
      // ✅ Navigate to login after successful signup
      setTimeout(() => {
        navigate('/login');
      }, 1500);
    }
  }, [signupMutation.isSuccess, signupMutation.data, navigate]);

  // ✅ Handle API validation errors
  useEffect(() => {
    if (signupMutation.isError) {
      const error = signupMutation.error as any;
      const detail = error.response?.data?.detail;
      
      // ✅ Handle 422 validation errors from backend
      if (Array.isArray(detail)) {
        detail.forEach((err: any) => {
          const field = err.loc?.[err.loc.length - 1];
          if (field && ['username', 'email', 'password', 'full_name'].includes(field)) {
            setError(field as any, { message: err.msg });
          } else {
            toast.error(err.msg);
          }
        });
      } else {
        toast.error(detail || 'Signup failed. Please try again.');
      }
    }
  }, [signupMutation.isError, signupMutation.error, setError]);

  const onSubmit = (data: SignupFormValues) => {
    // ✅ Map form fields to API fields
    signupMutation.mutate({
      username: data.username,
      email: data.email,
      password: data.password,
      full_name: data.full_name,
    });
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
        style={{ width: '100%', maxWidth: '500px' }}
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

            {/* Header */}
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
                    background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    mb: 2,
                    boxShadow: '0 4px 30px rgba(79, 172, 254, 0.4)',
                  }}
                >
                  <PersonIcon sx={{ fontSize: 32, color: 'white' }} />
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
                Create Account
              </Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                Join our community and get started
              </Typography>
            </Box>

            {/* Form */}
            <Fade in={true}>
              <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ position: 'relative', zIndex: 1 }}>
                {/* Full Name */}
                <TextField
                  fullWidth
                  label="Full Name"
                  {...register('full_name')}
                  error={!!errors.full_name}
                  helperText={errors.full_name?.message}
                  sx={{
                    mb: 3,
                    '& .MuiOutlinedInput-root': {
                      color: '#ffffff',
                      '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.2)' },
                      '&:hover fieldset': { borderColor: 'rgba(255, 255, 255, 0.3)' },
                      '&.Mui-focused fieldset': { borderColor: '#4facfe' },
                    },
                    '& .MuiInputLabel-root': { color: 'rgba(255, 255, 255, 0.6)' },
                    '& .MuiInputLabel-root.Mui-focused': { color: '#4facfe' },
                    '& .MuiFormHelperText-root': { color: 'rgba(255, 255, 255, 0.6)' },
                    '& .MuiFormHelperText-root.Mui-error': { color: '#ef5350' },
                  }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <PersonIcon sx={{ color: 'rgba(255, 255, 255, 0.5)' }} />
                      </InputAdornment>
                    ),
                  }}
                  placeholder="John Doe"
                  variant="outlined"
                  size="medium"
                  disabled={signupMutation.isPending}
                />

                {/* Username */}
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
                      '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.2)' },
                      '&:hover fieldset': { borderColor: 'rgba(255, 255, 255, 0.3)' },
                      '&.Mui-focused fieldset': { borderColor: '#4facfe' },
                    },
                    '& .MuiInputLabel-root': { color: 'rgba(255, 255, 255, 0.6)' },
                    '& .MuiInputLabel-root.Mui-focused': { color: '#4facfe' },
                    '& .MuiFormHelperText-root': { color: 'rgba(255, 255, 255, 0.6)' },
                    '& .MuiFormHelperText-root.Mui-error': { color: '#ef5350' },
                  }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <BadgeIcon sx={{ color: 'rgba(255, 255, 255, 0.5)' }} />
                      </InputAdornment>
                    ),
                  }}
                  placeholder="johndoe"
                  variant="outlined"
                  size="medium"
                  disabled={signupMutation.isPending}
                />

                {/* Email */}
                <TextField
                  fullWidth
                  label="Email Address"
                  {...register('email')}
                  error={!!errors.email}
                  helperText={errors.email?.message}
                  sx={{
                    mb: 3,
                    '& .MuiOutlinedInput-root': {
                      color: '#ffffff',
                      '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.2)' },
                      '&:hover fieldset': { borderColor: 'rgba(255, 255, 255, 0.3)' },
                      '&.Mui-focused fieldset': { borderColor: '#4facfe' },
                    },
                    '& .MuiInputLabel-root': { color: 'rgba(255, 255, 255, 0.6)' },
                    '& .MuiInputLabel-root.Mui-focused': { color: '#4facfe' },
                    '& .MuiFormHelperText-root': { color: 'rgba(255, 255, 255, 0.6)' },
                    '& .MuiFormHelperText-root.Mui-error': { color: '#ef5350' },
                  }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <EmailIcon sx={{ color: 'rgba(255, 255, 255, 0.5)' }} />
                      </InputAdornment>
                    ),
                  }}
                  placeholder="john@example.com"
                  variant="outlined"
                  size="medium"
                  disabled={signupMutation.isPending}
                />

                {/* Password */}
                <TextField
                  fullWidth
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  {...register('password')}
                  error={!!errors.password}
                  helperText={errors.password?.message}
                  sx={{
                    mb: 3,
                    '& .MuiOutlinedInput-root': {
                      color: '#ffffff',
                      '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.2)' },
                      '&:hover fieldset': { borderColor: 'rgba(255, 255, 255, 0.3)' },
                      '&.Mui-focused fieldset': { borderColor: '#4facfe' },
                    },
                    '& .MuiInputLabel-root': { color: 'rgba(255, 255, 255, 0.6)' },
                    '& .MuiInputLabel-root.Mui-focused': { color: '#4facfe' },
                    '& .MuiFormHelperText-root': { color: 'rgba(255, 255, 255, 0.6)' },
                    '& .MuiFormHelperText-root.Mui-error': { color: '#ef5350' },
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
                  disabled={signupMutation.isPending}
                />

                {/* Submit Button */}
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button
                    fullWidth
                    type="submit"
                    disabled={signupMutation.isPending}
                    sx={{
                      py: 1.5,
                      borderRadius: 2,
                      background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                      color: 'white',
                      fontWeight: 600,
                      fontSize: '1rem',
                      textTransform: 'none',
                      boxShadow: '0 4px 20px rgba(79, 172, 254, 0.3)',
                      '&:hover': {
                        background: 'linear-gradient(135deg, #3a9bf3 0%, #00d9e3 100%)',
                        boxShadow: '0 6px 25px rgba(79, 172, 254, 0.4)',
                      },
                      '&:disabled': {
                        background: 'rgba(255, 255, 255, 0.1)',
                        color: 'rgba(255, 255, 255, 0.3)',
                      },
                    }}
                  >
                    {signupMutation.isPending ? (
                      <CircularProgress size={24} sx={{ color: 'white' }} />
                    ) : (
                      'Create Account'
                    )}
                  </Button>
                </motion.div>

                {/* Divider */}
                <Box sx={{ my: 4, position: 'relative' }}>
                  <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                    <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.4)', px: 2 }}>
                      Already have an account?
                    </Typography>
                  </Divider>
                </Box>

                {/* Login Link */}
                <Box sx={{ textAlign: 'center' }}>
                  <Button
                    fullWidth
                    variant="outlined"
                    onClick={() => navigate('/login')}
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
                  >
                    Sign In to Existing Account
                  </Button>
                </Box>
              </Box>
            </Fade>
          </Paper>
        </Container>
      </motion.div>
    </Box>
  );
}

export default Signup;