import { useState } from 'react';
import {
  Box,
  Button,
  Container,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Menu,
  MenuItem,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
} from '@mui/material';
import {
  MoreVert as MoreVertIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import { motion } from 'framer-motion';
import { useGetAllUsers, useCreateUserMutation, useUpdatePasswordMutation } from './query';
import { toast } from 'react-toastify';
import { useAuthStore } from '../../store/authStore';
import { Navigate } from 'react-router-dom';

export default function AdminUsers() {
  const { user } = useAuthStore();
  if (user?.role !== 'ADMIN') {
    return <Navigate to="/sfu" replace />;
  }

  const { data: users, isLoading, error } = useGetAllUsers();
  
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const openMenu = Boolean(anchorEl);
  
  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  
  // Form States
  const [createData, setCreateData] = useState({ username: '', email: '', password: '', role: 'USER' });
  const [newPassword, setNewPassword] = useState('');

  const createUserMut = useCreateUserMutation();
  const updatePasswordMut = useUpdatePasswordMutation();

  const handleActionClick = (event: React.MouseEvent<HTMLElement>, user: any) => {
    setAnchorEl(event.currentTarget);
    setSelectedUser(user);
  };

  const handleCloseMenu = () => {
    setAnchorEl(null);
  };

  const handleCreateSubmit = () => {
    createUserMut.mutate(createData, {
      onSuccess: () => {
        toast.success("User created successfully!");
        setIsCreateModalOpen(false);
        setCreateData({ username: '', email: '', password: '', role: 'USER' });
      },
      onError: (err: any) => {
        toast.error(err?.response?.data?.message || "Failed to create user");
      }
    });
  };

  const handlePasswordSubmit = () => {
    if (!selectedUser) return;
    updatePasswordMut.mutate({ id: selectedUser.id, password: newPassword }, {
      onSuccess: () => {
        toast.success("Password updated successfully!");
        setIsPasswordModalOpen(false);
        setNewPassword('');
        handleCloseMenu();
      },
      onError: (err: any) => {
        toast.error(err?.response?.data?.message || "Failed to update password");
      }
    });
  };

  return (
    <Box sx={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
      p: { xs: 2, md: 4 },
      color: 'white',
      paddingTop: '80px' // Leave space for a navbar if present
    }}>
      <Container maxWidth="lg">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
            <Typography variant="h4" fontWeight={700}>
              User Management
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setIsCreateModalOpen(true)}
              sx={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                '&:hover': { background: 'linear-gradient(135deg, #5a6fd8 0%, #6a4190 100%)' }
              }}
            >
              Add User
            </Button>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              Failed to load users. Please ensure you are an Admin.
            </Alert>
          )}

          <TableContainer component={Paper} sx={{
            background: 'rgba(255, 255, 255, 0.05)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 2
          }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 'bold' }}>Username</TableCell>
                  <TableCell sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 'bold' }}>Email</TableCell>
                  <TableCell sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 'bold' }}>Role</TableCell>
                  <TableCell align="right" sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 'bold' }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} align="center" sx={{ py: 5 }}>
                      <CircularProgress sx={{ color: '#667eea' }} />
                    </TableCell>
                  </TableRow>
                ) : (
                  users?.map((user: any) => (
                    <TableRow key={user.id} sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                      <TableCell sx={{ color: 'white' }}>{user.username}</TableCell>
                      <TableCell sx={{ color: 'rgba(255,255,255,0.8)' }}>{user.email}</TableCell>
                      <TableCell sx={{ color: 'rgba(255,255,255,0.8)' }}>
                        <Box sx={{
                          display: 'inline-block',
                          px: 2,
                          py: 0.5,
                          borderRadius: 4,
                          fontSize: '0.8rem',
                          fontWeight: 'bold',
                          background: user.role === 'ADMIN' ? 'rgba(102, 126, 234, 0.2)' : 'rgba(255,255,255,0.1)',
                          color: user.role === 'ADMIN' ? '#667eea' : '#ccc'
                        }}>
                          {user.role}
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        <IconButton sx={{ color: 'white' }} onClick={(e) => handleActionClick(e, user)}>
                          <MoreVertIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </motion.div>
      </Container>

      {/* Action Menu */}
      <Menu
        anchorEl={anchorEl}
        open={openMenu}
        onClose={handleCloseMenu}
        PaperProps={{
          sx: { background: '#24243e', color: 'white', border: '1px solid rgba(255,255,255,0.1)' }
        }}
      >
        <MenuItem onClick={() => { setIsPasswordModalOpen(true); handleCloseMenu(); }}>
          Change Password
        </MenuItem>
      </Menu>

      {/* Create User Dialog */}
      <Dialog open={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} PaperProps={{
        sx: { background: '#24243e', color: 'white', border: '1px solid rgba(255,255,255,0.1)', minWidth: '400px' }
      }}>
        <DialogTitle>Create New User</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDir: 'column', gap: 2, pt: 1 }}>
          <TextField
            label="Username"
            variant="outlined"
            fullWidth
            value={createData.username}
            onChange={(e) => setCreateData({ ...createData, username: e.target.value })}
            sx={{ mt: 2, '& .MuiOutlinedInput-root': { color: 'white', '& fieldset': { borderColor: 'rgba(255,255,255,0.3)' } }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.7)' } }}
          />
          <TextField
            label="Email"
            variant="outlined"
            fullWidth
            value={createData.email}
            onChange={(e) => setCreateData({ ...createData, email: e.target.value })}
            sx={{ mt: 2, '& .MuiOutlinedInput-root': { color: 'white', '& fieldset': { borderColor: 'rgba(255,255,255,0.3)' } }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.7)' } }}
          />
          <TextField
            label="Password"
            type="password"
            variant="outlined"
            fullWidth
            value={createData.password}
            onChange={(e) => setCreateData({ ...createData, password: e.target.value })}
            sx={{ mt: 2, '& .MuiOutlinedInput-root': { color: 'white', '& fieldset': { borderColor: 'rgba(255,255,255,0.3)' } }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.7)' } }}
          />
          {/* Simple role selector */}
          <TextField
            label="Role"
            select
            SelectProps={{ native: true }}
            variant="outlined"
            fullWidth
            value={createData.role}
            onChange={(e) => setCreateData({ ...createData, role: e.target.value })}
            sx={{ mt: 2, '& .MuiOutlinedInput-root': { color: 'white', '& fieldset': { borderColor: 'rgba(255,255,255,0.3)' } }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.7)' }, '& option': { color: 'black' } }}
          >
            <option value="USER">USER</option>
            <option value="ADMIN">ADMIN</option>
          </TextField>
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={() => setIsCreateModalOpen(false)} sx={{ color: 'rgba(255,255,255,0.7)' }}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateSubmit} disabled={createUserMut.isPending} sx={{ background: '#667eea', '&:hover': { background: '#5a6fd8' } }}>
            {createUserMut.isPending ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={isPasswordModalOpen} onClose={() => setIsPasswordModalOpen(false)} PaperProps={{
        sx: { background: '#24243e', color: 'white', border: '1px solid rgba(255,255,255,0.1)', minWidth: '400px' }
      }}>
        <DialogTitle>Change Password for {selectedUser?.username}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDir: 'column', gap: 2, pt: 1 }}>
          <TextField
            label="New Password"
            type="password"
            variant="outlined"
            fullWidth
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            sx={{ mt: 2, '& .MuiOutlinedInput-root': { color: 'white', '& fieldset': { borderColor: 'rgba(255,255,255,0.3)' } }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.7)' } }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={() => setIsPasswordModalOpen(false)} sx={{ color: 'rgba(255,255,255,0.7)' }}>Cancel</Button>
          <Button variant="contained" onClick={handlePasswordSubmit} disabled={updatePasswordMut.isPending} sx={{ background: '#667eea', '&:hover': { background: '#5a6fd8' } }}>
            {updatePasswordMut.isPending ? 'Updating...' : 'Update'}
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
}
