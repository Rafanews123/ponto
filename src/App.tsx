import React, { useState, useMemo, ReactNode, useRef, useEffect } from "react";
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
  Check,
  FileUp,
  Loader2,
  ChevronLeft,
  CalendarDays,
  History,
  LogIn,
  LogOut,
  User as UserIcon
} from "lucide-react";
import { 
  employeeData as initialEmployeeData, 
  timeToMinutes, 
  minutesToTime, 
  EmployeeTimeData,
  formatTimeWithParens,
  DailyRecord,
  MonthlyHistory
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
import { GoogleGenAI, Type } from "@google/genai";
import { db, auth, loginWithGoogle, logout } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { 
  collection, 
  getDocs, 
  setDoc, 
  doc, 
  deleteDoc, 
  writeBatch,
  query,
  onSnapshot
} from "firebase/firestore";

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const [employees, setEmployees] = useState<EmployeeTimeData[]>(initialEmployeeData);
  const [preparedData, setPreparedData] = useState<EmployeeTimeData[] | null>(null);
  const [historyRecords, setHistoryRecords] = useState<MonthlyHistory[]>([]);
  const [viewMode, setViewMode] = useState<"current" | "history">("current");
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<"all" | "positive" | "negative">("all");
  const [sortConfig, setSortConfig] = useState<{ key: keyof EmployeeTimeData; direction: "asc" | "desc" }>({
    key: "name",
    direction: "asc",
  });
  const [copied, setCopied] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync with Firestore
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });

    const q = query(collection(db, "employees"));
    
    // Initial fetch and real-time listener combined
    const unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        console.log("No employees found in Firestore, using default data.");
      } else {
        const data = snapshot.docs.map(doc => ({
          ...doc.data(),
          details: (doc.data() as any).details || []
        })) as EmployeeTimeData[];
        setEmployees(data);
      }
      setIsLoading(false);
      setDbError(null);
    }, (error) => {
      console.error("Firestore sync error:", error);
      setDbError("Erro de conexão com o servidor. Verifique sua permissão.");
      setIsLoading(false);
    });

    return () => {
      unsubscribeAuth();
      unsubscribeSnapshot();
    };
  }, []);

  // Fetch history records
  useEffect(() => {
    const historyQuery = query(collection(db, "monthly_history"));
    const unsubscribeHistory = onSnapshot(historyQuery, (snapshot) => {
      const records = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as MonthlyHistory[];
      setHistoryRecords(records.sort((a, b) => b.id.localeCompare(a.id)));
    });

    return () => unsubscribeHistory();
  }, []);

  const currentMonthData = useMemo(() => {
    if (viewMode === "history" && selectedHistoryId) {
      const record = historyRecords.find(r => r.id === selectedHistoryId);
      return record ? record.data : [];
    }
    return employees;
  }, [viewMode, selectedHistoryId, historyRecords, employees]);

  const selectedEmployee = useMemo(() => 
    currentMonthData.find(e => e.id === selectedEmployeeId),
    [currentMonthData, selectedEmployeeId]
  );

  // Calculations
  const filteredAndSortedData = useMemo(() => {
    let result = [...currentMonthData];

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
  }, [currentMonthData, searchTerm, filterType, sortConfig]);

  const stats = useMemo(() => {
    const totalPos = currentMonthData.reduce((acc, emp) => {
      const pos = timeToMinutes(emp.positiveHours);
      return acc + (pos > 0 ? pos : 0);
    }, 0);

    const totalNeg = currentMonthData.reduce((acc, emp) => {
      const neg = timeToMinutes(emp.negativeHours);
      return acc + (neg > 0 ? neg : 0);
    }, 0);

    const netBalance = currentMonthData.reduce((acc, emp) => acc + timeToMinutes(emp.currentBalance), 0);

    return {
      totalPos: minutesToTime(totalPos, true),
      totalNeg: minutesToTime(totalNeg, true),
      netBalance: minutesToTime(netBalance, true),
      totalEmployees: currentMonthData.length,
      positiveCount: currentMonthData.filter(e => timeToMinutes(e.currentBalance) > 0).length,
      negativeCount: currentMonthData.filter(e => timeToMinutes(e.currentBalance) < 0).length,
      neutralCount: currentMonthData.filter(e => timeToMinutes(e.currentBalance) === 0).length,
    };
  }, [currentMonthData]);

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

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    setProcessingProgress(0);
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    
    try {
      const allNewEmployees: EmployeeTimeData[] = [];
      const fileList = Array.from(files) as File[];
      
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        try {
          const base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve((e.target?.result as string).split(',')[1]);
            reader.onerror = (err) => reject(err);
            reader.readAsDataURL(file);
          });

          const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: [
              {
                inlineData: {
                  mimeType: "application/pdf",
                  data: base64Data
                }
              },
              {
                text: "Analyze this employee time tracking (ponto) PDF. Extract the overall summary AND daily records. Return a JSON object with: id, name, previousBalance, positiveHours, negativeHours, currentBalance, and a details array of objects with keys (date, weekday, entries, workedHours, extraHours, debtHours, balance). Ensure all time values are in HH:MM format (e.g., 10:30 or -0:15). If a value is negative, it must start with a minus sign. Use the full name found in the document."
              }
            ],
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  name: { type: Type.STRING },
                  previousBalance: { type: Type.STRING },
                  positiveHours: { type: Type.STRING },
                  negativeHours: { type: Type.STRING },
                  currentBalance: { type: Type.STRING },
                  details: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        date: { type: Type.STRING },
                        weekday: { type: Type.STRING },
                        entries: { type: Type.STRING },
                        workedHours: { type: Type.STRING },
                        extraHours: { type: Type.STRING },
                        debtHours: { type: Type.STRING },
                        balance: { type: Type.STRING }
                      },
                      required: ["date", "weekday", "entries", "workedHours", "extraHours", "debtHours", "balance"]
                    }
                  }
                },
                required: ["id", "name", "previousBalance", "positiveHours", "negativeHours", "currentBalance", "details"]
              }
            }
          });

          const extractedData = JSON.parse(response.text) as EmployeeTimeData;
          allNewEmployees.push(extractedData);
        } catch (fileErr: any) {
          console.error(`Error processing file ${file.name}:`, fileErr);
        }
        setProcessingProgress(Math.round(((i + 1) / fileList.length) * 100));
      }

      setEmployees(allNewEmployees);
      setPreparedData(allNewEmployees);
      setSelectedEmployeeId(null); // Reset view
      setIsProcessing(false);
    } catch (error) {
      console.error("Error processing PDFs:", error);
      setIsProcessing(false);
    }
  };

  const handleSaveToCurrent = async () => {
    if (!user || !preparedData) return;
    try {
      setIsProcessing(true);
      const batch = writeBatch(db);
      
      // Delete old records first
      const oldDocs = await getDocs(collection(db, "employees"));
      oldDocs.forEach(d => batch.delete(d.ref));
      
      // Add new records
      preparedData.forEach(emp => {
        const docRef = doc(db, "employees", emp.id);
        batch.set(docRef, emp);
      });

      await batch.commit();
      setPreparedData(null);
      setIsProcessing(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "employees");
      setIsProcessing(false);
    }
  };

  const handleSaveToHistory = async (monthName: string) => {
    if (!user || !preparedData) return;
    try {
      setIsProcessing(true);
      // Generate ID from name or date
      const monthId = new Date().toISOString().slice(0, 7); // Default to current month
      
      await setDoc(doc(db, "monthly_history", monthId), {
        id: monthId,
        monthName: monthName,
        data: preparedData,
        createdAt: new Date()
      });

      setPreparedData(null);
      setIsProcessing(false);
      setViewMode("history");
      setSelectedHistoryId(monthId);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "monthly_history");
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-slate-500 font-medium">Carregando dados do servidor...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        {dbError && (
          <div className="bg-negative/10 border border-negative/20 text-negative p-4 rounded-lg flex items-center gap-3">
            <AlertCircle className="w-5 h-5" />
            <div className="flex-1">
              <p className="font-bold text-sm">Aviso de Sincronização</p>
              <p className="text-xs opacity-80">{dbError}. O dashboard está exibindo dados locais/cache temporariamente.</p>
            </div>
            <Button variant="outline" size="sm" className="bg-white border-negative/20 hover:bg-negative/5" onClick={() => window.location.reload()}>
              Reconectar
            </Button>
          </div>
        )}

        {preparedData && user && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-primary/5 border border-primary/20 p-4 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2 rounded-full">
                <FileUp className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-bold text-slate-800">Novos dados carregados!</p>
                <p className="text-xs text-slate-500">Deseja salvar estes dados no Dashboard Atual ou em um mês específico?</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleSaveToCurrent} disabled={isProcessing}>
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Salvar no Atual
              </Button>
              <Select onValueChange={(val) => handleSaveToHistory(val)}>
                <SelectTrigger className="w-[180px] bg-white h-9 text-xs">
                  <History className="w-3 h-3 mr-2" />
                  <SelectValue placeholder="Salvar no Histórico" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Janeiro 2026">Janeiro 2026</SelectItem>
                  <SelectItem value="Fevereiro 2026">Fevereiro 2026</SelectItem>
                  <SelectItem value="Março 2026">Março 2026</SelectItem>
                  <SelectItem value="Abril 2026">Abril 2026</SelectItem>
                  <SelectItem value="Maio 2026">Maio 2026</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" onClick={() => setPreparedData(null)} disabled={isProcessing}>
                Descartar
              </Button>
            </div>
          </motion.div>
        )}

        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard Banco de Horas</h1>
              {viewMode === "history" && (
                <Badge variant="secondary" className="bg-primary/10 text-primary border-none font-bold">
                  MODO HISTÓRICO
                </Badge>
              )}
            </div>
            <p className="text-slate-500">
              {viewMode === "current" 
                ? "Visualizando dados do dashboard principal" 
                : `Visualizando histórico de: ${historyRecords.find(r => r.id === selectedHistoryId)?.monthName}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Tabs */}
            <div className="bg-slate-200/50 p-1 rounded-lg flex items-center mr-2">
              <button
                onClick={() => setViewMode("current")}
                className={cn(
                  "px-3 py-1.5 text-xs font-bold rounded-md transition-all",
                  viewMode === "current" ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                Dashboard Atual
              </button>
              <Select 
                value={selectedHistoryId || undefined} 
                onValueChange={(val) => {
                  setViewMode("history");
                  setSelectedHistoryId(val);
                }}
              >
                <SelectTrigger className={cn(
                  "px-3 py-1.5 h-auto border-none bg-transparent text-xs font-bold shadow-none focus:ring-0",
                  viewMode === "history" ? "bg-white text-primary shadow-sm rounded-md" : "text-slate-500"
                )}>
                  <SelectValue placeholder="Meses Anteriores" />
                </SelectTrigger>
                <SelectContent>
                  {historyRecords.length === 0 && (
                    <SelectItem value="none" disabled>Nenhum histórico salvo</SelectItem>
                  )}
                  {historyRecords.map(record => (
                    <SelectItem key={record.id} value={record.id}>{record.monthName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {user ? (
              <div className="flex items-center gap-3 mr-4 py-2 px-3 bg-white rounded-lg border border-slate-200 shadow-sm">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt={user.displayName || ""} className="w-full h-full rounded-full" />
                  ) : (
                    <UserIcon className="w-4 h-4" />
                  )}
                </div>
                <div className="hidden sm:block">
                  <p className="text-[10px] text-slate-400 font-medium uppercase">Admin Autenticado</p>
                  <p className="text-xs font-bold text-slate-700">{user.displayName || user.email}</p>
                </div>
                <Button variant="ghost" size="icon-xs" onClick={logout} className="ml-1 text-slate-400 hover:text-negative">
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <Button variant="outline" className="gap-2 border-slate-200 hover:bg-slate-100 mr-4" onClick={loginWithGoogle}>
                <LogIn className="w-4 h-4" />
                Login Admin
              </Button>
            )}

            <input 
              type="file" 
              accept=".pdf" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleFileUpload}
              multiple
            />
            {user && (
              <Button 
                variant="outline"
                className="gap-2 border-slate-200 hover:bg-slate-100"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
                {isProcessing ? `Lendo (${processingProgress}%)` : "Atualizar Dados (PDF)"}
              </Button>
            )}
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

        {/* Main Content Area */}
        <AnimatePresence mode="wait">
          {!selectedEmployeeId ? (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
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
                      Ranking de Saldos (Top 10)
                    </CardTitle>
                    <CardDescription>Visualização dos colaboradores com maiores saldos</CardDescription>
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
                          <TableHead className="text-center font-semibold text-slate-900">Ação</TableHead>
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
                                onClick={() => emp.details && setSelectedEmployeeId(emp.id)}
                                className={cn(
                                  "group hover:bg-slate-50/80 transition-colors border-b border-slate-100",
                                  emp.details && "cursor-pointer"
                                )}
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
                                  {emp.details ? (
                                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                                      <History className="w-3 h-3" />
                                      Analisar
                                    </Button>
                                  ) : (
                                    <Badge className={cn(
                                      "px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold border-none",
                                      isPositive ? "bg-emerald-100 text-emerald-700" : 
                                      isNegative ? "bg-rose-100 text-rose-700" : 
                                      "bg-slate-100 text-slate-500"
                                    )}>
                                      {isPositive ? "Crédito" : isNegative ? "Débito" : "Zerado"}
                                    </Badge>
                                  )}
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
            </motion.div>
          ) : (
            <motion.div
              key="details"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              <Button 
                variant="ghost" 
                onClick={() => setSelectedEmployeeId(null)}
                className="gap-2 -ml-2 hover:bg-slate-100"
              >
                <ChevronLeft className="w-4 h-4" />
                Voltar ao Dashboard
              </Button>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-1 shadow-sm border-slate-200">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                        <Users className="w-6 h-6" />
                      </div>
                      <div>
                        <CardTitle className="text-xl font-bold">{selectedEmployee?.name}</CardTitle>
                        <CardDescription>ID: {selectedEmployee?.id}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 bg-slate-50 rounded-lg">
                        <div className="text-xs text-slate-500 mb-1">Banco Anterior</div>
                        <div className="font-mono font-bold text-slate-700">
                          {formatTimeWithParens(selectedEmployee?.previousBalance || "0:00")}
                        </div>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-lg">
                        <div className="text-xs text-slate-500 mb-1">Banco Atual</div>
                        <div className={cn(
                          "font-mono font-bold text-lg",
                          timeToMinutes(selectedEmployee?.currentBalance || "0:00") >= 0 ? "text-positive" : "text-negative"
                        )}>
                          {formatTimeWithParens(selectedEmployee?.currentBalance || "0:00")}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2 pt-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Total Positivas</span>
                        <span className="text-positive font-mono font-medium">
                          {formatTimeWithParens(selectedEmployee?.positiveHours || "0:00")}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Total Negativas</span>
                        <span className="text-negative font-mono font-medium">
                          {formatTimeWithParens(selectedEmployee?.negativeHours || "0:00")}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="lg:col-span-2 shadow-sm border-slate-200">
                  <CardHeader>
                    <CardTitle className="text-lg font-semibold flex items-center gap-2">
                      <CalendarDays className="w-5 h-5 text-primary" />
                      Detalhamento do Ponto (Dário)
                    </CardTitle>
                    <CardDescription>Análise diária de entradas, saídas e saldos</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                      <Table>
                        <TableHeader className="bg-slate-50/50 sticky top-0 z-10">
                          <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Dia</TableHead>
                            <TableHead>Registros</TableHead>
                            <TableHead className="text-right">Horas Trab.</TableHead>
                            <TableHead className="text-right">Saldo Dia</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedEmployee?.details?.map((day, idx) => {
                            const dayBalanceMin = timeToMinutes(day.balance);
                            return (
                              <TableRow key={idx}>
                                <TableCell className="py-2 text-xs font-medium">{day.date}</TableCell>
                                <TableCell className="py-2 text-xs text-slate-500">{day.weekday}</TableCell>
                                <TableCell className="py-2">
                                  <div className="flex flex-wrap gap-1">
                                    {day.entries.split(' ').map((t, i) => (
                                      <span key={i} className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] font-mono">
                                        {t}
                                      </span>
                                    ))}
                                  </div>
                                </TableCell>
                                <TableCell className="py-2 text-right font-mono text-xs text-slate-600">
                                  {day.workedHours}
                                </TableCell>
                                <TableCell className={cn(
                                  "py-2 text-right font-mono text-xs font-bold",
                                  dayBalanceMin > 0 ? "text-positive" : dayBalanceMin < 0 ? "text-negative" : "text-slate-400"
                                )}>
                                  {formatTimeWithParens(day.balance)}
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
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
