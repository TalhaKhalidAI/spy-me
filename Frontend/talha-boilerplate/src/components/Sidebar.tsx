// src/components/Sidebar.tsx

import { ReactNode } from 'react';
import {
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Box,
  Divider,
  IconButton,
  Tooltip,
  Avatar,
  Typography,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

// ============================================================
// TYPES
// ============================================================

export interface SidebarItem {
  id: string;
  label: string;
  icon: ReactNode;
  path?: string;
  onClick?: () => void;
  disabled?: boolean;
  divider?: boolean;
}

export interface SidebarSection {
  title?: string;
  items: SidebarItem[];
}

interface SidebarProps {
  /** Width when expanded (px) */
  widthExpanded?: number;
  /** Width when collapsed (px) */
  widthCollapsed?: number;
  /** Is sidebar collapsed */
  isCollapsed: boolean;
  /** Toggle collapse callback */
  onToggleCollapse: () => void;
  /** Sidebar sections (items grouped by section) */
  sections: SidebarSection[];
  /** Header content (logo, title) */
  header?: ReactNode;
  /** Footer content (profile, logout) */
  footer?: ReactNode;
  /** Current active item ID */
  activeItemId?: string;
  /** Custom item renderer */
  renderItem?: (item: SidebarItem, index: number) => ReactNode;
  /** On item click */
  onItemClick?: (item: SidebarItem) => void;
  /** Custom class names */
  className?: string;
  /** Mobile breakpoint */
  mobileBreakpoint?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

// ============================================================
// COMPONENT
// ============================================================

export function Sidebar({
  widthExpanded = 240,
  widthCollapsed = 64,
  isCollapsed,
  onToggleCollapse,
  sections,
  header,
  footer,
  activeItemId,
  renderItem,
  onItemClick,
  className = '',
  mobileBreakpoint = 'md',
}: SidebarProps) {
  const theme = useTheme();
  const navigate = useNavigate();
  const isMobile = useMediaQuery(theme.breakpoints.down(mobileBreakpoint));

  const handleItemClick = (item: SidebarItem) => {
    if (item.disabled) return;

    if (item.onClick) {
      item.onClick();
    } else if (item.path) {
      navigate(item.path);
    }

    onItemClick?.(item);
  };

  // ✅ Default item renderer
  const defaultRenderItem = (item: SidebarItem, index: number) => (
    <ListItem
      key={item.id}
      onClick={() => handleItemClick(item)}
      selected={activeItemId === item.id}
      disabled={item.disabled}
      sx={{
        minHeight: 48,
        justifyContent: isCollapsed ? 'center' : 'initial',
        px: 2.5,
        borderRadius: 2,
        mb: 0.5,
        mx: 1,
        cursor: item.disabled ? 'not-allowed' : 'pointer',
        opacity: item.disabled ? 0.4 : 1,
        '&.Mui-selected': {
          bgcolor: 'primary.main',
          color: 'white',
          '& .MuiListItemIcon-root': {
            color: 'white',
          },
          '&:hover': {
            bgcolor: 'primary.dark',
          },
        },
        '&:hover': {
          bgcolor: item.disabled ? 'transparent' : 'action.hover',
        },
      }}
    >
      <Tooltip title={isCollapsed ? item.label : ''} placement="right">
        <ListItemIcon
          sx={{
            minWidth: 0,
            mr: isCollapsed ? 'auto' : 3,
            justifyContent: 'center',
            color: activeItemId === item.id ? 'inherit' : 'primary.main',
          }}
        >
          {item.icon}
        </ListItemIcon>
      </Tooltip>
      <ListItemText
        primary={item.label}
        sx={{
          opacity: isCollapsed ? 0 : 1,
          transition: 'opacity 0.2s',
          '& .MuiTypography-root': {
            fontWeight: activeItemId === item.id ? 600 : 400,
          },
        }}
      />
    </ListItem>
  );

  const renderItemFn = renderItem || defaultRenderItem;

  // ✅ Render sections
  const renderSections = () => {
    return sections.map((section, sectionIndex) => (
      <Box key={`section-${sectionIndex}`}>
        {section.title && !isCollapsed && (
          <Typography
            variant="caption"
            sx={{
              px: 3,
              py: 1,
              display: 'block',
              color: 'text.secondary',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {section.title}
          </Typography>
        )}
        <List>
          {section.items.map((item, itemIndex) => {
            // ✅ Add divider before item if specified
            const showDivider = item.divider && itemIndex > 0;
            return (
              <Box key={item.id}>
                {showDivider && <Divider sx={{ my: 1 }} />}
                {renderItemFn(item, itemIndex)}
              </Box>
            );
          })}
        </List>
        {sectionIndex < sections.length - 1 && <Divider sx={{ my: 1 }} />}
      </Box>
    ));
  };

  // ✅ Drawer content
  const drawerContent = (
    <Box
      className={className}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflowX: 'hidden',
      }}
    >
      {/* ✅ Header */}
      {header && (
        <Box
          sx={{
            p: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: isCollapsed ? 'center' : 'flex-start',
            minHeight: 64,
            gap: 1,
          }}
        >
          {header}
        </Box>
      )}

      <Divider />

      {/* ✅ Sections */}
      <Box sx={{ flex: 1, overflowY: 'auto', py: 1 }}>
        {renderSections()}
      </Box>

      {/* ✅ Footer */}
      {footer && (
        <>
          <Divider />
          <Box sx={{ p: 1 }}>{footer}</Box>
        </>
      )}

      <Divider />

      {/* ✅ Toggle Button */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: isCollapsed ? 'center' : 'flex-end',
          p: 1,
        }}
      >
        <IconButton onClick={onToggleCollapse} size="small">
          {isCollapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
        </IconButton>
      </Box>
    </Box>
  );

  return (
    <Drawer
      variant={isMobile ? 'temporary' : 'permanent'}
      open={!isCollapsed || isMobile}
      onClose={onToggleCollapse}
      sx={{
        width: isCollapsed ? widthCollapsed : widthExpanded,
        flexShrink: 0,
        whiteSpace: 'nowrap',
        boxSizing: 'border-box',
        '& .MuiDrawer-paper': {
          width: isCollapsed ? widthCollapsed : widthExpanded,
          overflowX: 'hidden',
          transition: theme.transitions.create('width', {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          }),
          bgcolor: 'background.paper',
          borderRight: 1,
          borderColor: 'divider',
          boxSizing: 'border-box',
        },
      }}
    >
      {drawerContent}
    </Drawer>
  );
}