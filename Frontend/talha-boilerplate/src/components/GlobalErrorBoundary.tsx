import { Box, Typography, Button, Paper } from '@mui/material';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { ErrorOutline as ErrorIcon } from '@mui/icons-material';
import React from 'react';

function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return (
        <Box
            sx={{
                height: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: '#f9fafb',
                p: 3,
            }}
        >
            <Paper
                elevation={0}
                sx={{
                    p: 5,
                    maxWidth: 500,
                    textAlign: 'center',
                    borderRadius: 4,
                    border: '1px solid #e5e7eb',
                }}
            >
                <ErrorIcon color="error" sx={{ fontSize: 64, mb: 2 }} />
                <Typography variant="h5" fontWeight={700} gutterBottom>
                    Oops! Something went wrong
                </Typography>
                <Typography variant="body1" color="text.secondary" mb={4}>
                    We've encountered an unexpected error. Don't worry, our team has been notified.
                </Typography>

                <Box
                    sx={{
                        textAlign: 'left',
                        bgcolor: '#fee2e2',
                        p: 2,
                        borderRadius: 2,
                        mb: 4,
                        overflowX: 'auto',
                    }}
                >
                    <Typography variant="caption" sx={{ color: '#991b1b', fontFamily: 'monospace' }}>
                        {errorMessage}
                    </Typography>
                </Box>

                <Button
                    variant="contained"
                    size="large"
                    onClick={resetErrorBoundary}
                    sx={{
                        px: 4,
                        borderRadius: 2,
                        textTransform: 'none',
                        fontWeight: 600,
                    }}
                >
                    Try Again
                </Button>
            </Paper>
        </Box>
    );
}

export function GlobalErrorBoundary({ children }: { children: React.ReactNode }) {
    const handleError = (error: unknown, info: React.ErrorInfo) => {
        // This is where you would log to Sentry or another service
        console.error('Logging to monitoring service:', error, info);
    };

    return (
        <ErrorBoundary
            FallbackComponent={ErrorFallback}
            onReset={() => {
                // Reset the state of your app so the error doesn't happen again
                window.location.href = '/';
            }}
            onError={handleError}
        >
            {children}
        </ErrorBoundary>
    );
}
