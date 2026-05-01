import React, { useState } from 'react';
import { motion } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { updatePassword, updateEmail } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { 
  User, 
  Mail, 
  Lock, 
  Image as ImageIcon,
  Save,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { cn } from '../lib/utils';

export default function Profile() {
  const { profile, user } = useAuth();
  const [name, setName] = useState(profile?.name || '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatarUrl || '');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    setMessage(null);

    try {
      // Update Firestore
      await updateDoc(doc(db, 'users', user.uid), {
        name,
        avatarUrl,
        updatedAt: serverTimestamp()
      });

      // Update Password if provided
      if (newPassword) {
        await updatePassword(user, newPassword);
      }

      setMessage({ type: 'success', text: 'Perfil atualizado com sucesso!' });
      setNewPassword('');
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: 'Erro ao atualizar perfil. Certifique-se de que fez login recentemente.' });
    } finally {
      setLoading(false);
    }
  };

  const avatars = [
    `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`,
    `https://api.dicebear.com/7.x/bottts/svg?seed=${name}`,
    `https://api.dicebear.com/7.x/pixel-art/svg?seed=${name}`,
    `https://api.dicebear.com/7.x/miniavs/svg?seed=${name}`,
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <header>
        <h1 className="text-3xl font-light text-gray-900">Meu Perfil</h1>
        <p className="text-gray-500 text-sm mt-1">Gerencie suas informações pessoais e segurança da conta.</p>
      </header>

      {message && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "p-4 rounded-2xl flex items-center gap-3 text-sm font-medium shadow-sm border",
            message.type === 'success' ? "bg-green-50 text-green-700 border-green-100" : "bg-red-50 text-red-700 border-red-100"
          )}
        >
          {message.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          {message.text}
        </motion.div>
      )}

      <form onSubmit={handleUpdateProfile} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Avatar Section */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center h-fit">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-6 w-full text-center">Avatar</h3>
            <div className="relative group cursor-pointer mb-6">
              <img 
                src={avatarUrl} 
                alt="Avatar" 
                className="w-24 h-24 rounded-xl object-cover bg-slate-50 border border-slate-100 shadow-inner"
              />
              <div className="absolute inset-0 bg-slate-900/40 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <ImageIcon className="text-white" size={20} />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2 w-full">
              {avatars.map((url, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setAvatarUrl(url)}
                  className={cn(
                    "p-0.5 rounded-lg border-2 transition-all overflow-hidden bg-slate-50",
                    avatarUrl === url ? "border-brand" : "border-transparent opacity-60 hover:opacity-100"
                  )}
                >
                  <img src={url} alt={`Avatar option ${idx}`} className="w-full h-auto rounded-md" />
                </button>
              ))}
            </div>
          </div>

          {/* Form Section */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Dados Pessoais</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Nome Completo</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      type="text" 
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-brand transition-all outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">E-mail</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      type="email" 
                      value={profile?.email}
                      disabled
                      className="w-full pl-10 pr-3 py-2 bg-slate-100 border border-transparent rounded text-xs text-slate-400 cursor-not-allowed"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Segurança</h3>
              
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Nova Senha</label>
                <div className="relative max-w-xs">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input 
                    type="password" 
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    minLength={6}
                    className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-brand transition-all outline-none"
                  />
                </div>
                <p className="text-[9px] text-slate-400 mt-1 italic">Mínimo 6 caracteres para alteração.</p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button 
                type="submit"
                disabled={loading}
                className="bg-brand text-white px-6 py-2.5 rounded-md text-xs font-bold hover:bg-slate-800 transition-all disabled:opacity-50 flex items-center gap-2 shadow-sm"
              >
                {loading ? 'Salvando...' : <><Save size={16} /> Salvar Alterações</>}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
