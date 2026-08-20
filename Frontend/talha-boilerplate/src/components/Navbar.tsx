// src/components/Navbar.tsx

import { useNavigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Box,
  useTheme,
  Avatar,
  Badge,
  useMediaQuery,
} from '@mui/material';
import {
  Home as HomeIcon,
  VideoChat,
  Dashboard as DashboardIcon,
  Settings as SettingsIcon,
  Notifications as NotificationsIcon,
  Person as PersonIcon,
  Logout as LogoutIcon,
  DarkMode,
  LightMode,
} from '@mui/icons-material';
import { Sidebar, type SidebarItem } from './Sidebar';
import { useThemeMode } from '../hooks/useThemeMode';
import { useLogoutMutation } from '../pages/Login/query';
import { useNavigationStore } from '../store/navigationStore';

const DRAWER_WIDTH_EXPANDED = 240;
const DRAWER_WIDTH_COLLAPSED = 64;

interface NavbarProps {
  title?: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function Navbar({ title = 'My App', isCollapsed, onToggleCollapse }: NavbarProps) {
  const { mode, toggleTheme } = useThemeMode();
  const logoutMutation = useLogoutMutation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const navigate = useNavigate();
  const location = useLocation();
  const { activeItemId, setActiveItemId } = useNavigationStore();

  const handleSignOut = () => {
    logoutMutation.mutate();
  };

  // ✅ Sidebar sections configuration
  const sidebarSections = [
    {
      items: [
       
        // { id: 'dashboard', label: 'Dashboard', icon: <DashboardIcon />, path: '/talha/dashboard' },
      
        { id: 'webrtc', label: 'WebRtc', icon: <VideoChat />, path: '/talha/webrtc' },
        { id: 'live-call', label: 'Live Client', icon: <VideoChat />, path: '/talha/live' },
      { id: 'rtc-test2', label: 'RTC Test2', icon: <VideoChat />, path: '/talha/test2' },
      ],
    },
    {
      title: 'Account',
      items: [
      
        {
          id: 'logout',
          label: 'Logout',
          icon: <LogoutIcon />,
          onClick: handleSignOut,
          divider: true,
        }
      ],
    },
  ];

  // ✅ Sidebar header
  const sidebarHeader = (
    <>
      <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32 }}>T</Avatar>
      {!isCollapsed && (
        <Typography variant="h6" fontWeight={700} noWrap>
          Boilerplate
        </Typography>
      )}
    </>
  );

  // Sync active item with current route
  useEffect(() => {
    const currentPath = location.pathname;
    const allItems = sidebarSections.flatMap(section => section.items);
    const currentItem = allItems.find(item => item.path === currentPath);
    if (currentItem && currentItem.id !== activeItemId) {
      setActiveItemId(currentItem.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, setActiveItemId, activeItemId]);

  return (
    <>
      {/* ✅ AppBar */}
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          zIndex: theme.zIndex.drawer + 1,
          bgcolor: 'background.paper',
          borderBottom: 1,
          borderColor: 'divider',
          width: isMobile ? '100%' : `calc(100% - ${isCollapsed ? DRAWER_WIDTH_COLLAPSED : DRAWER_WIDTH_EXPANDED}px)`,
          ml: isMobile ? 0 : `${isCollapsed ? DRAWER_WIDTH_COLLAPSED : DRAWER_WIDTH_EXPANDED}px`,
          transition: theme.transitions.create(['width', 'margin'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          }),
        }}
      >
        <Toolbar sx={{ justifyContent: 'space-between' }}>
          <Typography variant="h6" fontWeight={600} color="text.primary" sx={{ display: { xs: 'none', sm: 'block' } }}>
            {title}
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton onClick={toggleTheme} sx={{ color: 'text.primary' }}>
              {mode === 'light' ? <DarkMode /> : <LightMode />}
            </IconButton>

            <IconButton sx={{ color: 'text.primary' }}>
              <Badge badgeContent={3} color="error">
                <NotificationsIcon />
              </Badge>
            </IconButton>

            <Avatar sx={{ width: 32, height: 32, ml: 1, bgcolor: 'secondary.main' }}>
              <PersonIcon fontSize="small" />
            </Avatar>
          </Box>
        </Toolbar>
      </AppBar>

      {/* ✅ Sidebar */}
      <Sidebar
        isCollapsed={isCollapsed}
        onToggleCollapse={onToggleCollapse}
        sections={sidebarSections}
        header={sidebarHeader}
        widthExpanded={DRAWER_WIDTH_EXPANDED}
        widthCollapsed={DRAWER_WIDTH_COLLAPSED}
        activeItemId={activeItemId}
        onItemClick={(item) => {
          if (item.id !== 'logout') {
            setActiveItemId(item.id);
          }
        }}
      />
    </>
  );
}