export interface EmployeeTimeData {
  id: string;
  name: string;
  previousBalance: string; // "HH:MM" or "-HH:MM"
  positiveHours: string;
  negativeHours: string;
  currentBalance: string;
}

export function timeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const isNegative = timeStr.startsWith('-') || timeStr.endsWith('-');
  const cleanStr = timeStr.replace('-', '');
  const [hours, minutes] = cleanStr.split(':').map(Number);
  const total = hours * 60 + minutes;
  return isNegative ? -total : total;
}

export function minutesToTime(totalMinutes: number, useParentheses: boolean = false): string {
  const isNegative = totalMinutes < 0;
  const absMinutes = Math.abs(totalMinutes);
  const hours = Math.floor(absMinutes / 60);
  const minutes = absMinutes % 60;
  const formatted = `${hours.toString().padStart(1, '0')}:${minutes.toString().padStart(2, '0')}`;
  
  if (isNegative) {
    return useParentheses ? `(${formatted})` : `-${formatted}`;
  }
  return formatted;
}

export function formatTimeWithParens(timeStr: string): string {
  if (!timeStr) return "0:00";
  if (timeStr.startsWith('-')) {
    return `(${timeStr.substring(1)})`;
  }
  return timeStr;
}

export const employeeData: EmployeeTimeData[] = [
  { id: "123230", name: "Andrea Didia Amorim DElia", previousBalance: "0:10", positiveHours: "0:00", negativeHours: "0:00", currentBalance: "0:10" },
  { id: "105580", name: "Antonio Venancio de Souza Filho", previousBalance: "15:47", positiveHours: "17:56", negativeHours: "3:08", currentBalance: "30:35" },
  { id: "131010", name: "Edir Lima de Oliveira", previousBalance: "4:37", positiveHours: "0:00", negativeHours: "3:40", currentBalance: "0:57" },
  { id: "128450", name: "Eliandson da Silva Lima", previousBalance: "0:00", positiveHours: "0:00", negativeHours: "0:06", currentBalance: "-0:06" },
  { id: "120840", name: "Erick Vinicius Alves Barbosa", previousBalance: "12:54", positiveHours: "46:08", negativeHours: "20:23", currentBalance: "38:39" },
  { id: "123620", name: "Ida Marcia Ferreira de Araujo", previousBalance: "27:06", positiveHours: "3:12", negativeHours: "0:00", currentBalance: "30:18" },
  { id: "125190", name: "Jonh Herbert da Silva Lima", previousBalance: "0:41", positiveHours: "4:03", negativeHours: "0:00", currentBalance: "4:44" },
  { id: "125210", name: "Luciano Pereira Correa", previousBalance: "7:32", positiveHours: "0:00", negativeHours: "7:30", currentBalance: "0:02" },
  { id: "131170", name: "Marcio Gomes Ribeiro", previousBalance: "0:24", positiveHours: "1:25", negativeHours: "0:44", currentBalance: "1:05" },
  { id: "128910", name: "Marcos Alexandre Cruz Aquino", previousBalance: "0:19", positiveHours: "6:08", negativeHours: "4:15", currentBalance: "2:12" },
  { id: "131110", name: "Mauro Allyson Guimaraes Praia", previousBalance: "2:11", positiveHours: "5:49", negativeHours: "7:30", currentBalance: "0:30" },
  { id: "117060", name: "Mona Lisa Luiza Barroso", previousBalance: "-2:28", positiveHours: "21:36", negativeHours: "3:00", currentBalance: "16:08" },
  { id: "126140", name: "Myrlands Pinto Coelho", previousBalance: "9:15", positiveHours: "1:11", negativeHours: "0:00", currentBalance: "10:26" },
  { id: "128020", name: "Rafael Magalhaes Vieira", previousBalance: "-5:00", positiveHours: "5:53", negativeHours: "0:00", currentBalance: "0:53" },
  { id: "128580", name: "Raimundo Nonato de Souza dos Santos", previousBalance: "14:37", positiveHours: "6:00", negativeHours: "0:00", currentBalance: "20:37" },
  { id: "131310", name: "Raylson Gomes Teixeira", previousBalance: "-16:54", positiveHours: "6:46", negativeHours: "0:08", currentBalance: "-10:16" },
  { id: "128600", name: "Reinaldo Cordeiro Miranda", previousBalance: "1:54", positiveHours: "9:08", negativeHours: "6:00", currentBalance: "5:02" },
  { id: "132190", name: "Rian Rodrigues Amazonas", previousBalance: "9:50", positiveHours: "0:00", negativeHours: "8:21", currentBalance: "1:29" },
  { id: "128400", name: "Rodrigo Azevedo Batalha", previousBalance: "2:00", positiveHours: "5:30", negativeHours: "7:30", currentBalance: "0:00" },
  { id: "122830", name: "Rodrigo Pereira Cavalcante", previousBalance: "3:28", positiveHours: "1:17", negativeHours: "1:11", currentBalance: "3:34" },
  { id: "125200", name: "Telmo da Mota Marques", previousBalance: "4:46", positiveHours: "0:27", negativeHours: "0:00", currentBalance: "5:13" },
  { id: "131700", name: "Thiago Marques de Amaral", previousBalance: "0:17", positiveHours: "2:00", negativeHours: "18:00", currentBalance: "-15:43" },
  { id: "128040", name: "Walmir Jorge Costa Mello", previousBalance: "7:31", positiveHours: "1:13", negativeHours: "10:37", currentBalance: "-1:53" },
];
