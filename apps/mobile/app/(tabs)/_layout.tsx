import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import type { ColorValue } from "react-native";
import { useTheme } from "../../src/theme";

const icon = (name: React.ComponentProps<typeof Ionicons>["name"]) => ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} color={color as string} size={size} />;

export default function TabsLayout() {
  const { c } = useTheme();
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: c.progress, tabBarInactiveTintColor: c.textMuted, tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.surfaceElevated } }}>
      <Tabs.Screen name="index" options={{ title: "Command", tabBarIcon: icon("shield-outline"), tabBarAccessibilityLabel: "Home, Command Center" }} />
      <Tabs.Screen name="quests" options={{ title: "Quests", tabBarIcon: icon("barbell-outline") }} />
      <Tabs.Screen name="trials" options={{ title: "Trials", tabBarIcon: icon("trophy-outline") }} />
      <Tabs.Screen name="phalanx" options={{ title: "Phalanx", tabBarIcon: icon("people-outline") }} />
      <Tabs.Screen name="profile" options={{ title: "Player", tabBarIcon: icon("person-outline") }} />
    </Tabs>
  );
}
