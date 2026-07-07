import { Tabs } from 'expo-router';
import type { SvgProps } from 'react-native-svg';

import { useSession } from '@/hooks/useSession';

import TablonIcon from '@/assets/tabbar/icon_tabbar_tablon.svg';
import TablonIconActive from '@/assets/tabbar/icon_tabbar_tablon-activated.svg';
import AgendaIcon from '@/assets/tabbar/icon_tabbar_agenda.svg';
import AgendaIconActive from '@/assets/tabbar/icon_tabbar_agenda-activated.svg';
import ChatIcon from '@/assets/tabbar/icon_tabbar_chat.svg';
import ChatIconActive from '@/assets/tabbar/icon_tabbar_chat-activated.svg';
import PerfilIcon from '@/assets/tabbar/icon_tabbar_perfil.svg';
import PerfilIconActive from '@/assets/tabbar/icon_tabbar_perfil-activated.svg';
import AdminIcon from '@/assets/tabbar/icon_tabbar_admin.svg';
import AdminIconActive from '@/assets/tabbar/icon_tabbar_admin-activated.svg';

type IconPair = { inactive: React.FC<SvgProps>; active: React.FC<SvgProps> };

function tabIcon({ inactive: Inactive, active: Active }: IconPair) {
  return function TabBarIcon({ focused }: { focused: boolean }) {
    const Icon = focused ? Active : Inactive;
    return <Icon width={40} />;
  };
}

export default function TabsLayout() {
  const { session } = useSession();
  const isAdmin = session?.role === 'admin';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: '#624325',
        tabBarInactiveTintColor: '#4F453C',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#EFE6D6',
          height: 72,
          paddingTop: 8,
        },
        tabBarItemStyle: { paddingVertical: 4 },
      }}
    >
      <Tabs.Screen
        name="tablon"
        options={{
          title: 'Tablón',
          tabBarIcon: tabIcon({ inactive: TablonIcon, active: TablonIconActive }),
        }}
      />
      <Tabs.Screen
        name="calendario"
        options={{
          title: 'Agenda',
          tabBarIcon: tabIcon({ inactive: AgendaIcon, active: AgendaIconActive }),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: tabIcon({ inactive: ChatIcon, active: ChatIconActive }),
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: 'Perfil',
          tabBarIcon: tabIcon({ inactive: PerfilIcon, active: PerfilIconActive }),
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: 'Admin',
          // The admin panel remains reachable programmatically (e.g. managers
          // opening posts), but the tab is only shown to admins.
          href: isAdmin ? '/(app)/(tabs)/admin' : null,
          tabBarIcon: tabIcon({ inactive: AdminIcon, active: AdminIconActive }),
        }}
      />
    </Tabs>
  );
}
