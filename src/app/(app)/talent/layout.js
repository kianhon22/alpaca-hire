'use client'

import { SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"

export default function TalentLayout({ children }) {
  return (
    <SidebarProvider>
      <div className="flex">
        <AppSidebar />

        <div className="flex-1 p-4">
          {children}
        </div>
      </div>
    </SidebarProvider>
  )
}
