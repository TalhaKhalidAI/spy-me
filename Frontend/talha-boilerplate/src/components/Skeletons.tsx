import { Box, Paper, Skeleton, Stack, Grid, Card, CardContent, LinearProgress } from '@mui/material';

/**
 * Skeleton for individual statistics cards
 */
export const StatCardSkeleton = () => (
    <Card sx={{ borderRadius: 3, boxShadow: 2 }}>
        <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                <Box sx={{ width: '60%' }}>
                    <Skeleton variant="text" width="80%" height={20} sx={{ mb: 1 }} />
                    <Skeleton variant="text" width="100%" height={40} sx={{ mb: 1 }} />
                    <Skeleton variant="rounded" width="40%" height={24} />
                </Box>
                <Skeleton variant="circular" width={48} height={48} />
            </Stack>
        </CardContent>
    </Card>
);

/**
 * Skeleton for Chart containers
 */
export const ChartSkeleton = () => (
    <Box sx={{ height: 350, width: '100%' }}>
        <Box mb={2}>
            <Skeleton variant="text" width="30%" height={32} />
            <Skeleton variant="text" width="50%" height={20} />
        </Box>
        <Skeleton variant="rounded" width="100%" height={300} />
    </Box>
);

/**
 * Full Dashboard loading skeleton
 */
export const DashboardSkeleton = () => (
    <Box sx={{ p: 3 }}>
        {/* Header Skeleton */}
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
            <Box sx={{ width: '40%' }}>
                <Skeleton variant="text" width="80%" height={60} />
                <Skeleton variant="text" width="60%" height={20} />
            </Box>
            <Stack direction="row" spacing={2}>
                <Skeleton variant="circular" width={40} height={40} />
                <Skeleton variant="circular" width={40} height={40} />
                <Skeleton variant="rounded" width={120} height={40} />
            </Stack>
        </Box>

        {/* Stats Grid Skeleton */}
        <Grid container spacing={3} mb={4}>
            {[1, 2, 3, 4].map((i) => (
                <Grid item xs={12} sm={6} lg={3} key={i}>
                    <StatCardSkeleton />
                </Grid>
            ))}
        </Grid>

        {/* Charts Grid Skeleton */}
        <Grid container spacing={3}>
            <Grid item xs={12} lg={8}>
                <Paper sx={{ p: 3, borderRadius: 3 }}>
                    <ChartSkeleton />
                </Paper>
            </Grid>
            <Grid item xs={12} lg={4}>
                <Paper sx={{ p: 3, borderRadius: 3 }}>
                    <ChartSkeleton />
                </Paper>
            </Grid>
        </Grid>
    </Box>
);

/**
 * Simple Page loading skeleton for Suspense fallbacks
 */
export const PageSkeleton = () => (
    <Box sx={{ width: '100%', position: 'fixed', top: 0, left: 0, zIndex: 9999 }}>
        <LinearProgress color="primary" />
        <Box sx={{ p: 4, height: '100vh', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Skeleton variant="rectangular" width="100%" height={64} sx={{ borderRadius: 2 }} />
            <Skeleton variant="rectangular" width="100%" height="80vh" sx={{ borderRadius: 4 }} />
        </Box>
    </Box>
);
