import { lazy, useState } from 'react'
const ProtectedRoute = lazy(() => import("./index"))
import { Navbar } from '@/components/Navbar'
import { Box, Toolbar } from '@mui/material'

function PRS() {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <Box sx={{ display: 'flex' }}>
      <Navbar
        isCollapsed={isCollapsed}
        onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
        title="Protected Area"
      />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 0, // Padding handled within the pages
          minHeight: '100vh',
          width: '100%',
          bgcolor: 'background.default'
        }}
      >
        <Toolbar /> {/* Spacer for the fixed AppBar */}
        <ProtectedRoute />
      </Box>
    </Box>
  )
}

export default PRS