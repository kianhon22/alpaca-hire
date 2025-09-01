"use client"
import React, { useEffect, useState, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { db } from "@/lib/firebase"
import { collection, getDocs, query, where, orderBy } from "firebase/firestore"
import { TrendingUp } from "lucide-react"
import { Area, AreaChart, CartesianGrid, XAxis, Tooltip, YAxis, Label, Pie, PieChart, Bar, BarChart } from "recharts"
import { ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import ResetFiltersButton from "@/components/ui/reset-filter-button"

/* ---------------- helpers used for onboarding keys ---------------- */
function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function tailOfPath(urlOrPath = "") {
  try {
    if (/^https?:\/\//i.test(urlOrPath)) {
      const u = new URL(urlOrPath);
      const last = u.pathname.split("/").filter(Boolean).pop();
      return last || u.hostname.replace(/^www\./, "");
    }
  } catch {}
  const parts = String(urlOrPath).split("/").filter(Boolean);
  return parts.pop() || "";
}

function slugFromTask(t) {
  const target = t?.target || t?.route || t?.url || t?.videoUrl || t?.courseId || "";
  if (t?.type === "upload") return `upload-${slugify(t.kind || "file")}`;
  if (t?.type === "form") return `form-${slugify(t.kind || "details")}`;
  if (t?.type === "course")
    return `course-${slugify(t.courseId || target || t.label || "course")}`;
  if (["page", "link", "video"].includes(t?.type)) {
    const tail = tailOfPath(target) || t?.label || t?.type;
    return `${slugify(t?.type)}-${slugify(tail)}`;
  }
  return `${slugify(t?.type || "task")}-${slugify(t?.label || target || "item")}`;
}

function completionKeyForTask(t, stepId, idx) {
  if (!t) return null;
  if (t.completionKey) return String(t.completionKey);
  return `${slugify(String(stepId || "step"))}--${slugFromTask(t)}`;
}

function DashboardPage() {

  const [stats, setStats] = useState({
    recruitingPositions: 0,
    totalApplications: 0,
    underReview: 0,
    interviewScheduled: 0,
    recruited: 0,
    pending: 0,
    onboardingProgress: 0,
    onboardingCompleted: 0,
  })

  const [departments, setDepartments] = useState([])
  const [years, setYears] = useState([])
  // const [filters, setFilters] = useState({
  //   department: "all",
  //   year: "all",
  //   month: "all",
  // })

  const initialFiltersRef = useRef({
    department: "all",
    year: "all",
    month: "all",
  })
  const [filters, setFilters] = useState(initialFiltersRef.current)

  const handleResetFilters = () => {
    setFilters(initialFiltersRef.current)
  }

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ]

  const [applicationsChartData, setApplicationsChartData] = useState([])
  const [trendPercentage, setTrendPercentage] = useState(0)

  const [applicationsStatusData, setApplicationsStatusData] = useState([])
  const [totalApplications, setTotalApplications] = useState(0)
  const [statusTrendPercentage, setStatusTrendPercentage] = useState(0)

  const [statusBarChartData, setStatusBarChartData] = useState([])
  const [statusBarTrendPercentage, setStatusBarTrendPercentage] = useState(0)

  const chartConfig = {
    total: {
      label: "Applications",
      color: "#FFAFCC",
    },
    pending: {
      label: "Pending",
      color: "#CDB4DB"
    },
    reviewing: {
      label: "Under Review",
      color: "#FFC8DD"
    },
    scheduled: {
      label: "Interview Scheduled",
      color: "#BDE0FE"
    },
    accepted: {
      label: "Recruited",
      color: "#A2D2FF"
    }
  }

  const statusBarConfig = {
    inProgress: {
      label: "In Progress",
      color: "#2B99FF",
    },
    completed: {
      label: "Accepted/Rejected",
      color: "#FFAFCC",
    },
  }

  // Fetch departments & years for dropdowns
  useEffect(() => {
    const fetchFilters = async () => {
      // Departments
      const deptSnap = await getDocs(collection(db, "departments"))
      const deptNames = deptSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })).map(d => d.name)
      setDepartments(["all", ...deptNames])

      // Years (from jobs + applications createdAt)
      const jobSnap = await getDocs(collection(db, "jobs"))
      const appSnap = await getDocs(collection(db, "applications"))
      const yearsSet = new Set()

      jobSnap.forEach(doc => {
        const createdAt = doc.data().createdAt?.toDate?.() || null
        if (createdAt) yearsSet.add(createdAt.getFullYear())
      })
      appSnap.forEach(doc => {
        const createdAt = doc.data().createdAt?.toDate?.() || null
        if (createdAt) yearsSet.add(createdAt.getFullYear())
      })

      setYears(["all", ...Array.from(yearsSet).sort((a, b) => b - a)])
    }

    fetchFilters()
  }, [])

  // Fetch stats and chart data whenever filters change
  useEffect(() => {
    const fetchStatsAndChartData = async () => {
      try {
        // --- Jobs ---
        let jobsQuery = query(collection(db, "jobs"), where("status", "==", "open"))
        const jobsSnap = await getDocs(jobsQuery)

        // Filter by department
        let filteredJobs = jobsSnap.docs
        if (filters.department !== "all") {
          // Need to get departmentId from "departments" collection
          const deptSnap = await getDocs(collection(db, "departments"))
          const dept = deptSnap.docs.find(d => d.data().name === filters.department)
          if (dept) {
            filteredJobs = filteredJobs.filter(j => j.data().departmentId === dept.id)
          }
        }

        // Filter by year + month
        if (filters.year !== "all" || filters.month !== "all") {
          filteredJobs = filteredJobs.filter(j => {
            const createdAt = j.data().createdAt?.toDate?.() || null
            if (!createdAt) return false
            const yearOk = filters.year === "all" || createdAt.getFullYear().toString() === filters.year
            const monthOk = filters.month === "all" || months[createdAt.getMonth()] === filters.month
            return yearOk && monthOk
          })
        }

        const recruitingPositions = filteredJobs.length
        const jobIds = filteredJobs.map(j => j.id)

        // --- Applications ---
        let appsQuery = collection(db, "applications")
        if (filters.department !== "all") {
          const deptSnap = await getDocs(collection(db, "departments"))
          const dept = deptSnap.docs.find(d => d.data().name === filters.department)
          if (dept) {
            const jobsInDeptQuery = query(collection(db, "jobs"), where("departmentId", "==", dept.id))
            const jobsInDeptSnap = await getDocs(jobsInDeptQuery)
            const jobIdsInDept = jobsInDeptSnap.docs.map(d => d.id)
            if (jobIdsInDept.length > 0) {
              appsQuery = query(appsQuery, where("jobId", "in", jobIdsInDept))
            } else {
              appsQuery = query(appsQuery, where("jobId", "in", ["no-jobs-exist"]))
            }
          }
        }
        if (filters.year !== "all") {
          const startOfYear = new Date(parseInt(filters.year), 0, 1)
          const endOfYear = new Date(parseInt(filters.year), 11, 31, 23, 59, 59)
          appsQuery = query(appsQuery, where("createdAt", ">=", startOfYear), where("createdAt", "<=", endOfYear))
        }
        if (filters.month !== "all") {
          const monthIndex = months.indexOf(filters.month)
          const year = filters.year === "all" ? new Date().getFullYear() : parseInt(filters.year)
          const startOfMonth = new Date(year, monthIndex, 1)
          const endOfMonth = new Date(year, monthIndex + 1, 0, 23, 59, 59)
          appsQuery = query(appsQuery, where("createdAt", ">=", startOfMonth), where("createdAt", "<=", endOfMonth))
        }
        
        const appsSnap = await getDocs(appsQuery)
        const filteredApps = appsSnap.docs

        // Generate applications trend chart data
        const applicationsByMonth = filteredApps.reduce((acc, doc) => {
          const createdAt = doc.data().createdAt?.toDate()
          if (createdAt) {
            const month = months[createdAt.getMonth()]
            const year = createdAt.getFullYear()
            const key = `${month} ${year}`
            acc[key] = (acc[key] || 0) + 1
          }
          return acc
        }, {})
        
        const sortedChartData = Object.keys(applicationsByMonth).sort((a,b) => {
          const [aMonth, aYear] = a.split(" ")
          const [bMonth, bYear] = b.split(" ")
          return new Date(aYear, months.indexOf(aMonth)) - new Date(bYear, months.indexOf(bMonth))
        }).map(key => ({
          month: key.split(" ")[0].slice(0, 3),
          total: applicationsByMonth[key]
        }))
        
        setApplicationsChartData(sortedChartData)
        
        // Calculate trend percentage
        if (sortedChartData.length >= 2) {
          const lastMonth = sortedChartData[sortedChartData.length - 1].total
          const secondLastMonth = sortedChartData[sortedChartData.length - 2].total
          const trend = ((lastMonth - secondLastMonth) / secondLastMonth) * 100
          setTrendPercentage(trend)
        } else {
          setTrendPercentage(0)
        }

        // Generate status bar chart data (In Progress vs Accepted/Rejected)
        const statusByMonth = filteredApps.reduce((acc, doc) => {
          const createdAt = doc.data().createdAt?.toDate()
          const status = doc.data().status || 'pending'
          
          if (createdAt) {
            const month = months[createdAt.getMonth()]
            const year = createdAt.getFullYear()
            const key = `${month} ${year}`
            
            if (!acc[key]) {
              acc[key] = { inProgress: 0, completed: 0 }
            }
            
            if (status === 'accepted' || status === 'rejected') {
              acc[key].completed += 1
            } else {
              acc[key].inProgress += 1
            }
          }
          return acc
        }, {})

        const sortedStatusBarData = Object.keys(statusByMonth).sort((a,b) => {
          const [aMonth, aYear] = a.split(" ")
          const [bMonth, bYear] = b.split(" ")
          return new Date(aYear, months.indexOf(aMonth)) - new Date(bYear, months.indexOf(bMonth))
        }).map(key => ({
          month: key.split(" ")[0].slice(0, 3),
          inProgress: statusByMonth[key].inProgress,
          completed: statusByMonth[key].completed
        }))

        setStatusBarChartData(sortedStatusBarData)

        // Calculate status bar trend percentage
        if (sortedStatusBarData.length >= 2) {
          const lastMonth = sortedStatusBarData[sortedStatusBarData.length - 1]
          const secondLastMonth = sortedStatusBarData[sortedStatusBarData.length - 2]
          const lastTotal = lastMonth.inProgress + lastMonth.completed
          const secondLastTotal = secondLastMonth.inProgress + secondLastMonth.completed
          const trend = secondLastTotal > 0 ? ((lastTotal - secondLastTotal) / secondLastTotal) * 100 : 0
          setStatusBarTrendPercentage(trend)
        } else {
          setStatusBarTrendPercentage(0)
        }
        
        // Generate applications status chart data
        const statusCounts = filteredApps.reduce((acc, doc) => {
          const status = doc.data().status || 'pending'
          acc[status] = (acc[status] || 0) + 1
          return acc
        }, {})

        const statusChartData = [
          { status: "pending", value: statusCounts.pending || 0, fill: "var(--color-pending)" },
          { status: "reviewing", value: statusCounts.reviewing || 0, fill: "var(--color-reviewing)" },
          { status: "scheduled", value: statusCounts.scheduled || 0, fill: "var(--color-scheduled)" },
          { status: "accepted", value: statusCounts.accepted || 0, fill: "var(--color-accepted)" }
        ]
        
        setApplicationsStatusData(statusChartData)
        setTotalApplications(filteredApps.length)
        
        // Calculate status trend percentage (using a simple metric for demonstration)
        const currentTotal = filteredApps.length
        const prevAppsSnap = await getDocs(query(appsQuery, orderBy("createdAt", "desc")))
        const prevTotal = prevAppsSnap.docs.length - currentTotal > 0 ? prevAppsSnap.docs.length - currentTotal : 1
        const trend = ((currentTotal - prevTotal) / prevTotal) * 100
        setStatusTrendPercentage(trend)


        // --- Onboarding ---
        let onboardingProgress = 0
        let onboardingCompleted = 0

        try {
          const empSnap = await getDocs(
            query(collection(db, "users"), where("role", "==", "employee"))
          )
          let employees = empSnap.docs.map((d) => ({ id: d.id, ...d.data() }))

          const inRange = (ts) => {
            if (filters.year === "all" && filters.month === "all") return true
            let date = ts?.toDate?.() || ts || null
            if (!date) return false
            const yearOk = filters.year === "all" || date.getFullYear().toString() === filters.year
            const monthOk = filters.month === "all" || months[date.getMonth()] === filters.month
            return yearOk && monthOk
          }

          if (filters.department !== "all") {
            const deptSnap = await getDocs(collection(db, "departments"))
            const dept = deptSnap.docs.find(d => d.data().name === filters.department)
            employees = employees.filter(
              (u) => inRange(u.createdAt) && u.departmentId === dept?.id
            )
          } else {
            employees = employees.filter(u => inRange(u.createdAt))
          }

          const baseKeys = []
          const baseStepsSnap = await getDocs(
            query(collection(db, "onboarding", "base", "steps"), orderBy("order", "asc"))
          )
          baseStepsSnap.docs.forEach((sd) => {
            const s = { id: sd.id, ...sd.data() }
            ;(Array.isArray(s.tasks) ? s.tasks : []).forEach((t, i) => {
              const k = completionKeyForTask(t, s.id, i)
              if (k) baseKeys.push(k)
            })
          })

          const deptIds = Array.from(new Set(employees.map((u) => u.departmentId).filter(Boolean)))
          const deptKeyMap = new Map()
          for (const deptId of deptIds) {
            const snap = await getDocs(
              query(collection(db, "onboarding", String(deptId), "steps"), orderBy("order", "asc"))
            )
            const arr = []
            snap.docs.forEach((sd) => {
              const s = { id: sd.id, ...sd.data() }
              ;(Array.isArray(s.tasks) ? s.tasks : []).forEach((t, i) => {
                const k = completionKeyForTask(t, s.id, i)
                if (k) arr.push(k)
              })
            })
            deptKeyMap.set(String(deptId), arr)
          }

          for (const u of employees) {
            const expected = [...baseKeys, ...(deptKeyMap.get(String(u.departmentId)) || [])]
            if (expected.length === 0) continue

            const tSnap = await getDocs(collection(db, "userOnboarding", u.id, "tasks"))
            const doneSet = new Set(
              tSnap.docs.filter((d) => (d.data() || {}).status === "done").map((d) => d.id)
            )
            const done = expected.filter((k) => doneSet.has(k)).length
            if (done === expected.length) onboardingCompleted += 1
            else onboardingProgress += 1
          }
        } catch (e) {
          console.error("Onboarding aggregation failed:", e)
        }

        setStats({
          recruitingPositions,
          totalApplications: filteredApps.length,
          underReview: filteredApps.filter(a => a.data().status === "reviewing").length,
          interviewScheduled: filteredApps.filter(a => a.data().status === "scheduled").length,
          recruited: filteredApps.filter(a => a.data().status === "accepted").length,
          pending: filteredApps.filter(a => a.data().status === "pending").length,
          onboardingProgress,
          onboardingCompleted,
        })
      } catch (error) {
        console.error("Error fetching stats:", error)
      }
    }

    fetchStatsAndChartData()
  }, [filters])

  return (
    <div className="space-y-6">
      <div className="rounded-xl text-[#2b99ff]">
        <h1 className="text-3xl font-bold">Dashboard</h1>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center">
        {/* Department Filter */}
        <select
          className="border rounded p-2"
          value={filters.department}
          onChange={(e) => setFilters({ ...filters, department: e.target.value })}
        >
          {departments.map((dept) => (
            <option key={dept} value={dept}>
              {dept === "all" ? "All Departments" : dept}
            </option>
          ))}
        </select>

        {/* Year Filter */}
        <select
          className="border rounded p-2"
          value={filters.year}
          onChange={(e) => setFilters({ ...filters, year: e.target.value })}
        >
          {years.map((yr) => (
            <option key={yr} value={yr}>
              {yr === "all" ? "All Years" : yr}
            </option>
          ))}
        </select>

        {/* Month Filter */}
        <select
          className="border rounded p-2"
          value={filters.month}
          onChange={(e) => setFilters({ ...filters, month: e.target.value })}
        >
          <option value="all">All Months</option>
          {months.map((mo) => (
            <option key={mo} value={mo}>{mo}</option>
          ))}
        </select>
        <ResetFiltersButton
          onReset={handleResetFilters}
          currentFilters={filters}
          initialFilters={initialFiltersRef.current}
          iconOnly      
          color="black"
          title="Reset filters"
        />
      </div>

      {/* Data Card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-5">
        <Card className='flex-1 bg-gray-50'>
          <CardContent>
            <h2 className='text-sm'>Recruiting Positions</h2>
            <h2 className='font-bold text-3xl mt-2'>{stats.recruitingPositions}</h2>
          </CardContent>
        </Card>
        <Card className='flex-1 bg-gray-50'>
          <CardContent>
            <h2 className='text-sm'>Total Applications</h2>
            <h2 className='font-bold text-3xl mt-2'>{stats.totalApplications}</h2>
          </CardContent>
        </Card>
        <Card className='flex-1 bg-gray-50'>
          <CardContent>
            <h2 className='text-sm'>Applications Under Review</h2>
            <h2 className='font-bold text-3xl mt-2'>{stats.underReview}</h2>
          </CardContent>
        </Card>
        <Card className='flex-1 bg-gray-50'>
          <CardContent>
            <h2 className='text-sm'>Interview Scheduled</h2>
            <h2 className='font-bold text-3xl mt-2'>{stats.interviewScheduled}</h2>
          </CardContent>
        </Card>
        <Card className='flex-1 bg-gray-50'>
          <CardContent>
            <h2 className='text-sm'>Total Recruited</h2>
            <h2 className='font-bold text-3xl mt-2'>{stats.recruited}</h2>
          </CardContent>
        </Card>
        <Card className='flex-1 bg-gray-50'>
          <CardContent>
            <h2 className='text-sm'>Pending</h2>
            <h2 className='font-bold text-3xl mt-2'>{stats.pending}</h2>
          </CardContent>
        </Card>
        <Card className='flex-1 bg-gray-50'>
          <CardContent>
            <h2 className='text-sm'>Onboarding - In Progress</h2>
            <h2 className='font-bold text-3xl mt-2'>{stats.onboardingProgress}</h2>
          </CardContent>
        </Card>
        <Card className='flex-1 bg-gray-50'>
          <CardContent>
            <h2 className='text-sm'>Onboarding - Completed</h2>
            <h2 className='font-bold text-3xl mt-2'>{stats.onboardingCompleted}</h2>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="flex flex-col md:flex-row gap-5 mt-5">
        {/* Applications Trend Chart */}
        <Card className="flex-1">
          <CardHeader>
            <CardTitle>Job Applications Trend</CardTitle>
            <CardDescription>
              Monthly overview of the total job applications submitted over time.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig}>
              <AreaChart
                accessibilityLayer
                data={applicationsChartData}
                margin={{
                  left: 12,
                  right: 12,
                }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={(value) => value.toString()}
                />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent indicator="line" />}
                />
                <Area
                  dataKey="total"
                  type="natural"
                  fill="#2B99FF"
                  fillOpacity={0.4}
                  stroke="#2B99FF"
                />
                <ChartLegend content={<ChartLegendContent />} />
              </AreaChart>
            </ChartContainer>
          </CardContent>
          <CardFooter>
            <div className="flex w-full items-start gap-2 text-sm">
              <div className="grid gap-2">
                <div className="flex items-center gap-2 leading-none font-medium">
                  {trendPercentage >= 0 ? 
                    <span className="text-green-500">Applications are trending up by {trendPercentage.toFixed(2)}%</span> :
                    <span className="text-red-500">Applications are trending down by {Math.abs(trendPercentage).toFixed(2)}%</span>
                  }
                  <TrendingUp className="h-4 w-4" />
                </div>
              </div>
            </div>
          </CardFooter>
        </Card>
      
        {/* Application Status Chart */}
        <Card className="flex flex-1 flex-col">
          <CardHeader className="items-center pb-0">
            <CardTitle>Application Status Distribution</CardTitle>
            <CardDescription>Proportional breakdown of applications across different status categories.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 pb-0">
            <ChartContainer
              config={chartConfig}
              className="mx-auto aspect-square max-h-[250px]"
            >
              <PieChart>
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent hideLabel />}
                />
                <Pie
                  data={applicationsStatusData}
                  dataKey="value"
                  nameKey="status"
                  innerRadius={60}
                  strokeWidth={5}
                >
                  <Label
                    content={({ viewBox }) => {
                      if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                        return (
                          <text
                            x={viewBox.cx}
                            y={viewBox.cy}
                            textAnchor="middle"
                            dominantBaseline="middle"
                          >
                            <tspan
                              x={viewBox.cx}
                              y={viewBox.cy}
                              className="fill-foreground text-3xl font-bold"
                            >
                              {totalApplications.toLocaleString()}
                            </tspan>
                            <tspan
                              x={viewBox.cx}
                              y={(viewBox.cy || 0) + 24}
                              className="fill-muted-foreground"
                            >
                              Applications
                            </tspan>
                          </text>
                        )
                      }
                    }}
                  />
                </Pie>
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Application Status Bar Chart */}
        <Card className="flex flex-1 flex-col">
          <CardHeader>
            <CardTitle>Application Outcomes Over Time</CardTitle>
            <CardDescription>
              Monthly comparison of applications that are still in progress vs those with completed outcomes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={statusBarConfig}>
              <BarChart accessibilityLayer data={statusBarChartData}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  tickMargin={10}
                  axisLine={false}
                  tickFormatter={(value) => value.slice(0, 3)}
                />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent indicator="dashed" />}
                />
                <Bar dataKey="inProgress" fill="var(--color-inProgress)" radius={4} />
                <Bar dataKey="completed" fill="var(--color-completed)" radius={4} />
              </BarChart>
            </ChartContainer>
          </CardContent>
          <CardFooter className="flex-col items-start gap-2 text-sm">
          </CardFooter>
        </Card>
      </div>
      
    </div>
  )
}

export default DashboardPage