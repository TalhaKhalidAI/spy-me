// MainPage.tsx
import React, { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { DashboardSkeleton } from '../../components/Skeletons';
import {
  Grid,
  Paper,
  Typography,
  Box,
  Card,
  CardContent,
  Avatar,
  Stack,
  Chip,
  Button,
  IconButton
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import {
  People as PeopleIcon,
  School as SchoolIcon,
  TrendingUp as TrendingUpIcon,
  AccessTime as AccessTimeIcon,
  Notifications as NotificationsIcon,
  Download as DownloadIcon,
  Logout as LogoutIcon
} from '@mui/icons-material';
import { useLogoutMutation } from '../Login/query';

// ==================== ECHARTS COMPONENT ====================
const ChartContainer = ({ option, style, title, subtitle }: {
  option: echarts.EChartsOption;
  style?: React.CSSProperties;
  title?: string;
  subtitle?: string;
}) => {
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    const chart = echarts.init(chartRef.current);
    chart.setOption(option);

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.dispose();
    };
  }, [option]);

  return (
    <Box>
      {(title || subtitle) && (
        <Box mb={2}>
          {title && <Typography variant="h6" fontWeight={600}>{title}</Typography>}
          {subtitle && (
            <Typography variant="body2" color="text.secondary">
              {subtitle}
            </Typography>
          )}
        </Box>
      )}
      <div ref={chartRef} style={{ width: '100%', height: '300px', ...style }} />
    </Box>
  );
};

// ==================== MAIN COMPONENT ====================
const MainPage: React.FC = () => {
  const navigate = useNavigate();
  const logoutMutation = useLogoutMutation();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate initial data fetch
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  const handleSignOut = () => {
    logoutMutation.mutate();
  };

  // Chart 1: Enrollment Trends
  const enrollmentOption: echarts.EChartsOption = {
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: [{
      type: 'category',
      data: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    }],
    yAxis: [{ type: 'value', name: 'Students' }],
    series: [{
      name: 'Enrollments',
      type: 'bar',
      data: [120, 200, 150, 80, 70, 110, 130, 180, 210, 240, 190, 220],
      itemStyle: { color: '#4f46e5', borderRadius: [4, 4, 0, 0] }
    }]
  };

  // Chart 3: Performance Gauge
  const performanceOption: echarts.EChartsOption = {
    series: [{
      type: 'gauge',
      center: ['50%', '60%'],
      startAngle: 200,
      endAngle: -20,
      progress: { show: true, width: 18, itemStyle: { color: '#4f46e5' } },
      axisLine: { lineStyle: { width: 18, color: [[1, '#e5e7eb']] } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      detail: {
        valueAnimation: true,
        formatter: '{value}%',
        fontSize: 24,
        fontWeight: 'bold'
      },
      data: [{ value: 78.5 }]
    }]
  };

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <Box sx={{ p: 3, minHeight: '100vh' }}>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
        <Box>
          <Typography variant="h4" fontWeight={700} gutterBottom>
            🎓 LMS Dashboard
          </Typography>
          <Typography variant="body1" color="#6b7280">
            Welcome back, Professor! Here's your learning overview.
          </Typography>
        </Box>
        <Stack direction="row" spacing={2} alignItems="center">
          <IconButton sx={{ bgcolor: 'white', boxShadow: 1 }} onClick={handleSignOut} title="Sign Out">
            <LogoutIcon color="error" />
          </IconButton>
          <IconButton sx={{ bgcolor: 'white', boxShadow: 1 }}>
            <NotificationsIcon />
          </IconButton>
          <Button variant="contained" startIcon={<DownloadIcon />}>
            Export Report
          </Button>
        </Stack>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={3} mb={4}>
        {[
          { title: 'Total Students', value: '2,847', change: '+12.5%', icon: <PeopleIcon />, color: '#4f46e5' },
          { title: 'Active Courses', value: '48', change: '+3', icon: <SchoolIcon />, color: '#10b981' },
          { title: 'Completion Rate', value: '84.2%', change: '+5.3%', icon: <TrendingUpIcon />, color: '#f59e0b' },
          { title: 'Avg. Study Time', value: '6.2 hrs', change: '+1.4 hrs', icon: <AccessTimeIcon />, color: '#ef4444' }
        ].map((stat, index) => (
          <Grid item xs={12} sm={6} lg={3} key={index}>
            <Card sx={{ borderRadius: 3, boxShadow: 2 }}>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                  <Box>
                    <Typography variant="subtitle2" color="#6b7280" gutterBottom>
                      {stat.title}
                    </Typography>
                    <Typography variant="h4" fontWeight={700} sx={{ color: stat.color, mb: 0.5 }}>
                      {stat.value}
                    </Typography>
                    <Chip
                      label={stat.change}
                      size="small"
                      sx={{
                        bgcolor: `${stat.color}15`,
                        color: stat.color,
                        fontWeight: 600
                      }}
                    />
                  </Box>
                  <Avatar sx={{
                    bgcolor: `${stat.color}15`,
                    color: stat.color,
                    width: 48,
                    height: 48
                  }}>
                    {stat.icon}
                  </Avatar>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Charts Section */}
      <Grid container spacing={3}>
        <Grid item xs={12} lg={8}>
          <Paper sx={{ p: 3, borderRadius: 3, boxShadow: 2 }}>
            <ChartContainer
              option={enrollmentOption}
              title="📈 Enrollment Trends"
              subtitle="Monthly student enrollment"
            />
          </Paper>
        </Grid>

        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 3, borderRadius: 3, boxShadow: 2 }}>
            <ChartContainer
              option={performanceOption}
              title="🎯 Overall Performance"
              subtitle="Average student performance score"
            />
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default MainPage;