import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface NavigationState {
    activeItemId: string;
    setActiveItemId: (id: string) => void;
}

export const useNavigationStore = create<NavigationState>()(
    persist(
        (set) => ({
            activeItemId: 'home',
            setActiveItemId: (id: string) => set({ activeItemId: id }),
        }),
        {
            name: 'navigation-storage',
        }
    )
);
