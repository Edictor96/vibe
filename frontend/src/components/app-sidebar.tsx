"use client"

import * as React from "react"
import {
  BookOpen,
  Megaphone,
  MessagesSquare,
  SquareTerminal,
} from "lucide-react"

import { NavMain } from "./nav-main"
import { AuroraText } from "@/components/magicui/aurora-text"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Link } from "@tanstack/react-router"
import logo from "../../public/img/vibe_logo_img.ico"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { useAuthStore } from "@/store/auth-store"
import { useCourseStore } from "@/store/course-store"

export function AppSidebar() {
  // Set default state to "expanded"
  const { state } = useSidebar()
  const { user } = useAuthStore.getState()
  const { currentCourse } = useCourseStore()

  // Discussion is course-scoped — only render the nav entry when a course
  // is in context. The URL is dynamic, so the entry is added below via the
  // resolved-href pattern (`resolveHref` on NavMain).
  const discussionHref = currentCourse?.courseId
    ? `/teacher/courses/${currentCourse.courseId}/discussions`
    : null

  const data = {
    user: {
      name: user?.name || "User",
      avatar: user?.avatar,
    },
    navMain: [
      {
        title: "Courses",
        url: "#",
        icon: BookOpen,
        items: [
          { title: "Create Course", url: "/teacher/courses/create" },
          { title: "All Courses", url: "/teacher" },
        ],
      },
      {
        title: "Announcements",
        url: "/teacher/announcements",
        icon: Megaphone,
      },
      // Course-scoped Discussion entry — added only when a course is open.
      // `url` is the path prefix that all discussion sub-routes share so
      // `NavMain`'s `pathname.startsWith` check still produces an active
      // state on both list and thread pages.
      ...(discussionHref
        ? [
            {
              title: "Discussion",
              url: "/teacher/courses/",
              icon: MessagesSquare,
            },
          ]
        : []),
      {
        title: "HP System",
        url: "/teacher/hp-system",
        icon: SquareTerminal,
      },
    ],
  }

  return (
    <Sidebar collapsible="icon" variant="sidebar" className="border-r">

      <SidebarHeader className="flex items-center px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg overflow-hidden shrink-0">
            <img
              src={logo}
              alt="Vibe Logo"
              className="h-10 w-10 object-contain"
            />
          </div>
          {state === "expanded" && (
            <span className="text-2xl font-bold">
              <AuroraText colors={["#A07CFE", "#FE8FB5", "#FFBE7B"]}><b>ViBe</b></AuroraText>
            </span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <NavMain
          items={data.navMain}
          resolveHref={item =>
            // The discussion entry only appears with a real courseId;
            // resolve the placeholder URL to the active course's discussion
            // list so the link actually navigates somewhere real.
            item.title === "Discussion" && discussionHref
              ? discussionHref
              : item.url
          }
        />
      </SidebarContent>

      <SidebarFooter>
        {state === "expanded" && (
          <Link
            to="/teacher/profile"
            className="group flex items-center gap-3 px-4 py-3 hover:bg-accent/30 transition rounded-md cursor-pointer w-full"
          >
            <Avatar className="h-9 w-9 border border-border/20">
              <AvatarImage
                src={data.user.avatar || "/placeholder.svg"}
                alt={data.user.name}
              />
              <AvatarFallback className="bg-gradient-to-br from-primary/15 to-primary/5 text-primary font-bold text-sm">
                {data.user.name?.charAt(0).toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>

            {state === "expanded" && (
              <div className="flex flex-col text-left min-w-0">
                <div className="text-sm font-medium truncate" title={data.user.name}>
                  {data.user.name}
                </div>
                <div className="text-xs text-muted-foreground">View Profile</div>
              </div>
            )}
          </Link>
        )}
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}