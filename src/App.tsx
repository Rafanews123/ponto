import { useState, useMemo, ReactNode } from "react";
import { 
  Search, 
  TrendingUp, 
  TrendingDown, 
  Users, 
  ArrowUpDown, 
  Filter,
  Download,
  Calendar,
  Clock,
  AlertCircle,
  Copy,
  Check
} from "lucide-react";
import { 
  employeeData, 
  timeToMinutes, 
  minutesToTime, 
  EmployeeTimeData,
  formatTimeWithParens
} from "@/types";
import { cn } from "@/lib/utils";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie
} from "recharts";
import { motion, AnimatePresence } from "motion/react";
import * as XLSX from "xlsx";

export default function App() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<"all" | "positive" | "negative">("all");
  const [sortConfig, setSortConfig] = useState<{ key: keyof EmployeeTimeData; direction: "asc" | "desc" }>({
    key: "name",
    direction: "asc",
  });
  const [copied, setCopied] = useState(false);

  // Calculations
  const filteredAndSortedData = useMemo(() => {
    let result = [...employeeData];

    // Search
    if (searchTerm) {
      result = result.filter((emp) => 
        emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.id.includes(searchTerm)
      );
    }

    // Filter
    if (filterType === "positive") {
      result = result.filter((emp) => timeToMinutes(emp.currentBalance) > 0);
    } else if (filterType === "negative") {
      result = result.filter((emp) => timeToMinutes(emp.currentBalance) < 0);
    }

    // Sort
    result.sort((a, b) => {
      const valA = a[sortConfig.key];
      const valB = b[sortConfig.key];

      if (sortConfig.key === "name") {
        return sortConfig.direction === "asc" 
          ? valA.localeCompare(valB) 
          : valB.localeCompare(valA);
      } else {
        const minA = timeToMinutes(valA as string);
        const minB = timeToMinutes(valB as string);
        return sortConfig.direction === "asc" ? minA - minB : minB - minA;
      }
    });

    return result;
  }, [searchTerm, filterType, sortConfig]);

  const stats = useMemo(() => {
    const totalPos = employeeData.reduce((acc, emp) => {
      const pos = timeToMinutes(emp.positiveHours);
      return acc + (pos > 0 ? pos : 0);
    }, 0);

    const totalNeg = employeeData.reduce((acc, emp) => {
      const neg = timeToMinutes(emp.negativeHours);
      return acc + (neg > 0 ? neg : 0);
    }, 0);

    const netBalance = employeeData.reduce((acc, emp) => acc + timeToMinutes(emp.currentBalance), 0);

    return {
      totalPos: minutesToTime(totalPos, true),
      totalNeg: minutesToTime(totalNeg, true),
      netBalance: minutesToTime(netBalance, true),
      totalEmployees: employeeData.length,
      positiveCount: employeeData.filter(e => timeToMinutes(e.currentBalance) > 0).length,
      negativeCount: employeeData.filter(e => timeToMinutes(e.currentBalance) < 0).length,
      neutralCount: employeeData.filter(e => timeToMinutes(e.currentBalance) === 0).length,
    };
  }, []);

  const chartData = useMemo(() => {
    return filteredAndSortedData.slice(0, 10).map(emp => ({
      name: emp.name.split(' ')[0],
      balance: timeToMinutes(emp.currentBalance) / 60, // in hours for chart
      fullName: emp.name
    }));
  }, [filteredAndSortedData]);

  const pieData = [
    { name: 'Positivo', value: stats.positiveCount, color: '#10b981' },
    { name: 'Negativo', value: stats.negativeCount, color: '#ef4444' },
    { name: 'Neutro', value: stats.neutralCount, color: '#6b7280' },
  ];

  const handleSort = (key: keyof EmployeeTimeData) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const handleExportXLSX = () => {
    const data = filteredAndSortedData.map(emp => ({
      "ID": emp.id,
      "Nome": emp.name,
      "Banco Anterior": formatTimeWithParens(emp.previousBalance),
      "Horas Positivas": formatTimeWithParens(emp.positiveHours),
      "Horas Negativas": formatTimeWithParens(emp.negativeHours),
      "Banco Atual": formatTimeWithParens(emp.currentBalance)
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Banco de Horas");
    
    // Auto-size columns
    const maxWidths = data.reduce((acc: any, row: any) => {
      Object.keys(row).forEach((key, i) => {
        const val = String(row[key]);
        acc[i] = Math.max(acc[i] || 0, val.length, key.length);
      });
      return acc;
    }, []);
    worksheet["!cols"] = maxWidths.map((w: number) => ({ w: w + 2 }));

    XLSX.writeFile(workbook, `relatorio_banco_horas_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleCopyToClipboard = () => {
    const headers = ["ID", "Nome", "Banco Anterior", "Horas Positivas", "Horas Negativas", "Banco Atual"];
    const rows = filteredAndSortedData.map(emp => [
      emp.id,
      emp.name,
      formatTimeWithParens(emp.previousBalance),
      formatTimeWithParens(emp.positiveHours),
      formatTimeWithParens(emp.negativeHours),
      formatTimeWithParens(emp.currentBalance)
    ]);

    const text = [
      headers.join("\t"),
      ...rows.map(row => row.join("\t"))
    ].join("\n");

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="min-h-screen bg-slate-50/50 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard Banco de Horas</h1>
            <p className="text-slate-500 mt-1">Análise consolidada do período: Março 2026</p>
          </div>
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              className="gap-2 border-slate-200 hover:bg-slate-100"
              onClick={handleCopyToClipboard}
            >
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copiado!" : "Copiar Tabela"}
            </Button>
            <Button 
              className="gap-2 bg-primary hover:bg-primary/90"
              onClick={handleExportXLSX}
            >
              <Download className="w-4 h-4" />
              Exportar XLSX
            </Button>
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard 
            title="Total Horas Positivas" 
            value={stats.totalPos} 
            icon={<TrendingUp className="text-positive" />} 
            description="Soma de todos os créditos"
            trend="+12% vs mês anterior"
          />
          <StatCard 
            title="Total Horas Negativas" 
            value={stats.totalNeg} 
            icon={<TrendingDown className="text-negative" />} 
            description="Soma de todos os débitos"
            trend="-5% vs mês anterior"
          />
          <StatCard 
            title="Saldo Geral Equipe" 
            value={stats.netBalance} 
            icon={<Clock className="text-primary" />} 
            description="Consolidado final"
            isBalance
          />
          <StatCard 
            title="Total Colaboradores" 
            value={stats.totalEmployees.toString()} 
            icon={<Users className="text-slate-600" />} 
            description="Base ativa analisada"
          />
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 shadow-sm border-slate-200">
            <CardHeader>
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                Top 10 Saldos Atuais (Horas)
              </CardTitle>
              <CardDescription>Visualização dos maiores saldos do período</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} />
                  <Tooltip 
                    cursor={{fill: '#f8fafc'}}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: number) => [`${value.toFixed(2)}h`, 'Saldo']}
                  />
                  <Bar dataKey="balance" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.balance >= 0 ? '#10b981' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-200">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Distribuição de Saldos</CardTitle>
              <CardDescription>Status geral da equipe</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px] flex flex-col items-center justify-center">
              <ResponsiveContainer width="100%" height="80%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-3 gap-4 w-full mt-4">
                {pieData.map((item) => (
                  <div key={item.name} className="text-center">
                    <div className="text-xs text-slate-500 mb-1">{item.name}</div>
                    <div className="font-bold" style={{ color: item.color }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Table Section */}
        <Card className="shadow-sm border-slate-200 overflow-hidden">
          <CardHeader className="border-b border-slate-100 bg-white">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-xl font-bold">Listagem de Colaboradores</CardTitle>
                <CardDescription>Controle detalhado de horas por funcionário</CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-full md:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    placeholder="Buscar por nome ou ID..." 
                    className="pl-9 bg-slate-50 border-slate-200 focus:bg-white transition-all"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <Select value={filterType} onValueChange={(v: any) => setFilterType(v)}>
                  <SelectTrigger className="w-[160px] bg-slate-50 border-slate-200">
                    <Filter className="w-4 h-4 mr-2 text-slate-400" />
                    <SelectValue placeholder="Filtrar por" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="positive">Saldo Positivo</SelectItem>
                    <SelectItem value="negative">Saldo Negativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50/50">
                  <TableRow>
                    <TableHead className="w-[100px] font-semibold text-slate-900">ID</TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-slate-100 transition-colors font-semibold text-slate-900"
                      onClick={() => handleSort("name")}
                    >
                      <div className="flex items-center gap-2">
                        Nome do Colaborador
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </div>
                    </TableHead>
                    <TableHead 
                      className="text-right cursor-pointer hover:bg-slate-100 transition-colors font-semibold text-slate-900"
                      onClick={() => handleSort("previousBalance")}
                    >
                      <div className="flex items-center justify-end gap-2">
                        Banco Anterior
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </div>
                    </TableHead>
                    <TableHead className="text-right font-semibold text-slate-900">Horas Positivas</TableHead>
                    <TableHead className="text-right font-semibold text-slate-900">Horas Negativas</TableHead>
                    <TableHead 
                      className="text-right cursor-pointer hover:bg-slate-100 transition-colors font-semibold text-slate-900"
                      onClick={() => handleSort("currentBalance")}
                    >
                      <div className="flex items-center justify-end gap-2">
                        Banco Atual
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </div>
                    </TableHead>
                    <TableHead className="text-center font-semibold text-slate-900">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <AnimatePresence mode="popLayout">
                    {filteredAndSortedData.map((emp) => {
                      const balanceMin = timeToMinutes(emp.currentBalance);
                      const isPositive = balanceMin > 0;
                      const isNegative = balanceMin < 0;

                      return (
                        <motion.tr
                          key={emp.id}
                          layout
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="group hover:bg-slate-50/80 transition-colors border-b border-slate-100"
                        >
                          <TableCell className="font-mono text-xs text-slate-500">{emp.id}</TableCell>
                          <TableCell className="font-medium text-slate-900">{emp.name}</TableCell>
                          <TableCell className="text-right font-mono text-slate-600">
                            {formatTimeWithParens(emp.previousBalance)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-positive font-medium">
                            {formatTimeWithParens(emp.positiveHours)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-negative font-medium">
                            {formatTimeWithParens(emp.negativeHours)}
                          </TableCell>
                          <TableCell className={cn(
                            "text-right font-mono font-bold text-lg",
                            isPositive ? "text-positive" : isNegative ? "text-negative" : "text-slate-400"
                          )}>
                            {formatTimeWithParens(emp.currentBalance)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge className={cn(
                              "px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold border-none",
                              isPositive ? "bg-emerald-100 text-emerald-700" : 
                              isNegative ? "bg-rose-100 text-rose-700" : 
                              "bg-slate-100 text-slate-500"
                            )}>
                              {isPositive ? "Crédito" : isNegative ? "Débito" : "Zerado"}
                            </Badge>
                          </TableCell>
                        </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                  {filteredAndSortedData.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="h-32 text-center text-slate-500">
                        <div className="flex flex-col items-center gap-2">
                          <AlertCircle className="w-8 h-8 text-slate-300" />
                          <p>Nenhum colaborador encontrado com os filtros atuais.</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, description, trend, isBalance }: { 
  title: string; 
  value: string; 
  icon: ReactNode; 
  description: string;
  trend?: string;
  isBalance?: boolean;
}) {
  const valMin = isBalance ? timeToMinutes(value) : 0;
  const colorClass = isBalance 
    ? (valMin > 0 ? "text-positive" : valMin < 0 ? "text-negative" : "text-slate-900")
    : "text-slate-900";

  return (
    <Card className="shadow-sm border-slate-200 hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium text-slate-500">{title}</CardTitle>
        <div className="p-2 bg-slate-50 rounded-lg">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className={cn("text-2xl font-bold tracking-tight", colorClass)}>{value}</div>
        <p className="text-xs text-slate-400 mt-1">{description}</p>
        {trend && (
          <div className={cn(
            "text-[10px] font-semibold mt-2 flex items-center gap-1",
            trend.startsWith('+') ? "text-positive" : "text-negative"
          )}>
            {trend}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
