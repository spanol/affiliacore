import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LayoutDashboard, LogIn, UserPlus } from 'lucide-react';

export default function Home() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 transition-colors duration-300">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-12 max-w-2xl px-6"
      >
        <div className="space-y-4">
          <h1 className="text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-6xl">
            Agência <span className="text-brand">Boost</span>
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-lg font-medium leading-relaxed">
            Plataforma profissional de gestão de afiliados. Alta densidade de dados, performance e resultados.
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          {user ? (
            <Link 
              to="/dashboard" 
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 bg-slate-900 dark:bg-brand text-white rounded-xl hover:opacity-90 transition-all font-bold shadow-lg shadow-slate-200 dark:shadow-brand/20"
            >
              <LayoutDashboard size={20} />
              Acessar Meu Painel
            </Link>
          ) : (
            <>
              <Link 
                to="/login" 
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:scale-[1.02] active:scale-[0.98] transition-all font-bold shadow-sm"
              >
                <LogIn size={20} />
                Entrar no Sistema
              </Link>
              <Link 
                to="/register" 
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 bg-brand text-white rounded-xl hover:bg-slate-800 dark:hover:bg-brand/80 hover:scale-[1.02] active:scale-[0.98] transition-all font-bold shadow-lg shadow-brand/20"
              >
                <UserPlus size={20} />
                Criar Conta Agora
              </Link>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
