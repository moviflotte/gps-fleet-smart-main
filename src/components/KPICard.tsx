import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface KPICardProps {
  title: string
  value: string | number
  subtitle?: string
  trend?: {
    value: string
    isPositive: boolean
  }
  status?: "success" | "warning" | "danger" | "info"
  icon?: React.ReactNode
}

export function KPICard({ title, value, subtitle, trend, status, icon }: KPICardProps) {
  const getStatusColors = () => {
    switch (status) {
      case "success":
        return "text-success"
      case "warning":
        return "text-warning"
      case "danger":
        return "text-danger"
      case "info":
        return "text-info"
      default:
        return "text-foreground"
    }
  }

  const getTrendColors = () => {
    if (!trend) return ""
    return trend.isPositive ? "text-success" : "text-danger"
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {icon && (
          <div className={cn("h-4 w-4", getStatusColors())}>
            {icon}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className={cn("text-2xl font-bold", getStatusColors())}>
          {value}
        </div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">
            {subtitle}
          </p>
        )}
        {trend && (
          <div className="flex items-center mt-2">
            <Badge 
              variant="outline" 
              className={cn("text-xs", getTrendColors())}
            >
              {trend.isPositive ? "↗" : "↘"} {trend.value}
            </Badge>
          </div>
        )}
        
      </CardContent>
    </Card>
  )
}