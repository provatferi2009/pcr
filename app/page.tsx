'use client';

import React, { useState, useEffect } from 'react';
import {
  User,
  Phone,
  BookOpen,
  School,
  IdCard,
  GraduationCap,
  Building,
  CreditCard,
  Download,
  CheckCircle2,
  AlertCircle,
  MapPin
} from 'lucide-react';

const banglaDigits: Record<string, string> = {
  '0': '০', '1': '১', '2': '২', '3': '৩', '4': '৪',
  '5': '৫', '6': '৬', '7': '৭', '8': '৮', '9': '৯',
};

function toBanglaNum(n: number): string {
  return n.toLocaleString('en-US').replace(/\d/g, (d) => banglaDigits[d]);
}

export default function Home() {
  const [showPopup, setShowPopup] = useState(true);

  // Warm up the serverless function in background while user fills the form
  useEffect(() => {
    fetch('/api/health').catch(() => {});
  }, []);
  const [formMode, setFormMode] = useState<'course' | 'member' | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    address: '',
    phone: '',
    service: '', // Course name
    isDuStudent: 'no', // 'yes' | 'no'
    academicSession: '',
    department: '',
    hallName: '',
    duRegistrationId: '',
    paymentMethod: '', // 'bkash' | 'nagad'
    transactionId: '',
  });

  const [fullAmount, setFullAmount] = useState(3100);
  const [amount, setAmount] = useState(3100);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState('invoice.pdf');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (formMode === 'member') {
      setFullAmount(100);
      setAmount(100);
    } else if (formMode === 'course') {
      const base = formData.isDuStudent === 'yes' ? 2550 : 3100;
      setFullAmount(base);
      setAmount(base);
    }
  }, [formMode, formData.isDuStudent]);

  useEffect(() => {
    if (formMode === 'member') {
      setAmount(100);
    } else {
      setAmount(fullAmount);
    }
  }, [formMode, fullAmount]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (loading) {
      interval = setInterval(() => {
        setProgress((p) => {
          if (p >= 90) return p;
          const speed = p < 30 ? 3 : p < 60 ? 2 : 1;
          return Math.min(p + speed, 90);
        });
      }, 300);
    } else {
      setProgress(0);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [loading]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    if (validationErrors[name]) {
      setValidationErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formData.name.trim()) errors.name = 'নাম আবশ্যক।';
    if (formMode === 'course' && !formData.address.trim()) {
      errors.address = 'ঠিকানা আবশ্যক।';
    }
    if (!formData.phone.trim()) {
      errors.phone = 'ফোন নম্বর আবশ্যক।';
    } else if (!/^[0-9+-\s()]{10,15}$/.test(formData.phone)) {
      errors.phone = 'সঠিক ফোন নম্বর লিখুন (১১ ডিজিট)।';
    }
    if (formMode === 'course' && !formData.service) errors.service = 'একটি কোর্স সিলেক্ট করুন।';
    if (!formData.paymentMethod) errors.paymentMethod = 'পেমেন্ট মাধ্যম সিলেক্ট করুন।';
    if (!formData.transactionId.trim()) errors.transactionId = 'ট্রানজেকশন আইডি (TrxID) দিন।';

    if (formMode === 'member') {
      if (!formData.academicSession.trim()) errors.academicSession = 'শিক্ষাবর্ষ আবশ্যক।';
      if (!formData.department.trim()) errors.department = 'বিভাগের নাম আবশ্যক।';
      if (!formData.hallName.trim()) errors.hallName = 'হলের নাম আবশ্যক।';
      if (!formData.duRegistrationId.trim()) errors.duRegistrationId = 'রেজিস্ট্রেশন আইডি আবশ্যক।';
    }

    if (formMode === 'course' && formData.isDuStudent === 'yes') {
      if (!formData.academicSession.trim()) errors.academicSession = 'শিক্ষাবর্ষ আবশ্যক।';
      if (!formData.department.trim()) errors.department = 'বিভাগের নাম আবশ্যক।';
      if (!formData.hallName.trim()) errors.hallName = 'হলের নাম আবশ্যক।';
      if (!formData.duRegistrationId.trim()) errors.duRegistrationId = 'রেজিস্ট্রেশন আইডি আবশ্যক।';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setProgress(0);

    if (!validateForm()) return;
    setLoading(true);

    try {
      const response = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          amount,
          isDuStudent: formData.isDuStudent === 'yes',
          paymentType: 'full',
          fullAmount,
          formMode,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'আবেদন জমা দিতে সমস্যা হয়েছে। আবার চেষ্টা করুন।');
      }

      setProgress(60);

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const filename = `invoice-${formMode === 'member' ? 'M' : ''}${Date.now()}.pdf`;

      setProgress(80);
      setDownloadUrl(blobUrl);
      setDownloadName(filename);

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();

      setProgress(100);
      setSuccess(true);

      setFormData({
        name: '',
        address: '',
        phone: '',
        service: '',
        isDuStudent: 'no',
        academicSession: '',
        department: '',
        hallName: '',
        duRegistrationId: '',
        paymentMethod: '',
        transactionId: '',
      });

      setTimeout(() => setLoading(false), 800);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'নেটওয়ার্ক বা সার্ভারে সমস্যা হয়েছে। আবার চেষ্টা করুন।');
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 font-bengali">

      {/* Banner/Header */}
      <div className="px-5 md:px-8 py-6 md:py-10 relative">
        <div className="max-w-2xl mx-auto text-center">
          <img src="/logo.png" alt="Logo" className="h-20 mx-auto mb-4 object-contain" />
          <h1 className="text-xl md:text-3xl font-bold tracking-tight mb-2 text-brand-primary">সাংস্কৃতিক সংসদ, ঢাকা বিশ্ববিদ্যালয়</h1>
          <p className="text-brand-primary/70 text-sm">
            {formMode === 'member'
              ? 'ক্লাব সদস্যপদ ফরম। প্রয়োজনীয় তথ্য দিয়ে আপনার রেজিস্ট্রেশন সম্পন্ন করুন।'
              : formMode === 'course'
              ? 'সঙ্গীত ও বাদ্যযন্ত্র কোর্স ভর্তি ফরম। প্রয়োজনীয় তথ্য দিয়ে আপনার রেজিস্ট্রেশন সম্পন্ন করুন।'
              : 'সঙ্গীত ও বাদ্যযন্ত্র কোর্স ভর্তি ও ক্লাব সদস্যপদ ফরম।'}
          </p>
        </div>
      </div>

      {/* Mode Selection Popup */}
      {showPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 text-center animate-fade-in">
            <img src="/logo.png" alt="Logo" className="h-16 mx-auto mb-5 object-contain" />
            <h2 className="text-2xl font-bold text-brand-primary mb-3">আপনি কী করতে চান?</h2>
            <p className="text-slate-600 text-sm mb-8">আপনার উদ্দেশ্য নির্বাচন করুন</p>
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => { setFormMode('course'); setShowPopup(false); }}
                className="w-full px-6 py-4 rounded-2xl text-base font-bold text-white bg-brand-primary hover:bg-brand-primary-hover active:scale-[0.99] shadow-lg shadow-brand-primary/20 transition-all duration-200"
              >
                কোর্সে ভর্তি হতে চাই
              </button>
              <button
                type="button"
                onClick={() => { setFormMode('member'); setShowPopup(false); }}
                className="w-full px-6 py-4 rounded-2xl text-base font-bold text-brand-primary bg-brand-primary-light hover:bg-brand-secondary-light border-2 border-brand-primary active:scale-[0.99] transition-all duration-200"
              >
                ক্লাবের সদস্য হতে চাই
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-5 md:px-8 py-6 md:py-10">
          {!formMode && (
            <div className="text-center py-12 text-slate-400">
              <p className="text-lg">উপরে আপনার উদ্দেশ্য নির্বাচন করুন</p>
            </div>
          )}

          {formMode && success && (
            <div className="mb-8 p-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-start gap-4 animate-fade-in">
              <CheckCircle2 className="w-6 h-6 mt-0.5 shrink-0 text-emerald-600" />
              <div>
                <h4 className="font-bold text-base text-emerald-900">রেজিস্ট্রেশন সফলভাবে সম্পন্ন হয়েছে!</h4>
                <p className="text-sm text-emerald-800/90 mt-1">
                  {formMode === 'member'
                    ? 'আপনার সদস্যপদ রেজিস্ট্রেশন সফলভাবে সম্পন্ন হয়েছে। আপনার কপি ডাউনলোড করা শুরু হয়েছে।'
                    : 'আপনার পেমেন্ট ভেরিফিকেশন এবং এডমিন ইনভয়েস সফলভাবে লগ করা হয়েছে। আপনার কপি ডাউনলোড করা শুরু হয়েছে।'}
                </p>
                {downloadUrl && (
                  <a
                    href={downloadUrl}
                    download={downloadName}
                    className="inline-flex items-center gap-2 mt-4 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl transition-all shadow-md shadow-emerald-200"
                  >
                    <Download className="w-4 h-4" />
                    রসিদটি পুনরায় ডাউনলোড করুন
                  </a>
                )}
              </div>
            </div>
          )}

          {formMode && error && (
            <div className="mb-8 p-5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-4">
              <AlertCircle className="w-6 h-6 mt-0.5 shrink-0 text-rose-600" />
              <div>
                <h4 className="font-bold text-base text-rose-900">আবেদন ব্যর্থ হয়েছে</h4>
                <p className="text-sm text-rose-800/90 mt-1">{error}</p>
              </div>
            </div>
          )}

          {formMode && (
          <form onSubmit={handleSubmit} className="space-y-5 md:space-y-6">

            {/* Name & Phone Field Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <User className="w-4 h-4 text-brand-primary" />
                  আবেদনকারীর নাম <span className="text-rose-500">*</span>
                  <span className="text-xs text-slate-500 font-normal">(ইংরেজিতে লিখুন)</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  disabled={loading}
                  placeholder="যেমন: Saiful Islam Ibu"
                  className={`w-full px-4 py-3 rounded-xl text-sm bg-slate-50 border ${validationErrors.name ? 'border-rose-400 focus:ring-rose-200' : 'border-slate-200 focus:ring-brand-primary-light'
                    } focus:outline-none focus:ring-4 focus:border-brand-primary transition-all duration-200 text-slate-900`}
                />
                {validationErrors.name && (
                  <p className="text-xs text-rose-500 font-medium">{validationErrors.name}</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Phone className="w-4 h-4 text-brand-primary" />
                  মোবাইল নম্বর <span className="text-rose-500">*</span>
                  <span className="text-xs text-slate-500 font-normal">(ইংরেজিতে লিখুন)</span>
                </label>
                <input
                  type="tel"
                  inputMode="numeric"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  disabled={loading}
                  placeholder="যেমন: 017XXXXXXXX"
                  className={`w-full px-4 py-3 rounded-xl text-sm bg-slate-50 border ${validationErrors.phone ? 'border-rose-400 focus:ring-rose-200' : 'border-slate-200 focus:ring-brand-primary-light'
                    } focus:outline-none focus:ring-4 focus:border-brand-primary transition-all duration-200 text-slate-900`}
                />
                {validationErrors.phone && (
                  <p className="text-xs text-rose-500 font-medium">{validationErrors.phone}</p>
                )}
              </div>
            </div>

            {/* Address Field - course mode only */}
            {formMode === 'course' && (
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-brand-primary" />
                ঠিকানা <span className="text-rose-500">*</span>
                <span className="text-xs text-slate-500 font-normal">(ইংরেজিতে লিখুন)</span>
              </label>
              <input
                type="text"
                name="address"
                value={formData.address}
                onChange={handleInputChange}
                disabled={loading}
                placeholder="যেমন: Shegunbagicha, Dhaka"
                className={`w-full px-4 py-3 rounded-xl text-sm bg-slate-50 border ${validationErrors.address ? 'border-rose-400 focus:ring-rose-200' : 'border-slate-200 focus:ring-brand-primary-light'
                  } focus:outline-none focus:ring-4 focus:border-brand-primary transition-all duration-200 text-slate-900`}
              />
              {validationErrors.address && (
                <p className="text-xs text-rose-500 font-medium">{validationErrors.address}</p>
              )}
            </div>
            )}

            {/* Course Dropdown - only for course mode */}
            {formMode === 'course' && (
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-brand-primary" />
                কোর্স নির্বাচন করুন <span className="text-rose-500">*</span>
              </label>
              <select
                name="service"
                value={formData.service}
                onChange={handleInputChange}
                disabled={loading}
                className={`w-full px-4 py-3 rounded-xl text-sm bg-slate-50 border ${validationErrors.service ? 'border-rose-400' : 'border-slate-200'
                  } focus:outline-none focus:ring-4 focus:ring-brand-primary-light focus:border-brand-primary transition-all duration-200 text-slate-900`}
              >
                <option value="">কোর্স সিলেক্ট করুন</option>
                <option value="Flute">বাঁশি (Flute)</option>
                <option value="Guitar">গিটার (Guitar)</option>
                <option value="Violin">ভায়োলিন (Violin)</option>
                <option value="Vocal">কণ্ঠসঙ্গীত (Vocal)</option>
                <option value="Ukulele">ইউকুলেলে (Ukulele)</option>
                <option value="Dotara">দোতারা (Dotara)</option>
              </select>
              {validationErrors.service && (
                <p className="text-xs text-rose-500 font-medium">{validationErrors.service}</p>
              )}
            </div>
            )}

            {/* Dhaka University Student Cascade Question - only for course mode */}
            {formMode === 'course' && (
            <div className="space-y-3 bg-slate-50 p-4 md:p-5 rounded-2xl border border-slate-200/60">
              <label className="text-sm font-bold text-slate-800 block">
                আপনি কি ঢাকা বিশ্ববিদ্যালয়ের (ঢাবি) শিক্ষার্থী? (বর্তমান/প্রাক্তন)
              </label>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-700">
                  <input
                    type="radio"
                    name="isDuStudent"
                    value="yes"
                    checked={formData.isDuStudent === 'yes'}
                    onChange={handleInputChange}
                    disabled={loading}
                    className="w-4 h-4 text-brand-primary focus:ring-brand-primary"
                  />
                  হ্যাঁ (Yes)
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-700">
                  <input
                    type="radio"
                    name="isDuStudent"
                    value="no"
                    checked={formData.isDuStudent === 'no'}
                    onChange={handleInputChange}
                    disabled={loading}
                    className="w-4 h-4 text-brand-primary focus:ring-brand-primary"
                  />
                  না (No)
                </label>
              </div>

              {/* DU Student Details Cascade Fields */}
              {formData.isDuStudent === 'yes' && (
                <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                      <GraduationCap className="w-3.5 h-3.5 text-brand-primary" />
                      শিক্ষাবর্ষ (Academic Session) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="academicSession"
                      value={formData.academicSession}
                      onChange={handleInputChange}
                      disabled={loading}
                      placeholder="যেমন: 2020-21"
                      className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-1 transition-all text-slate-900"
                    />
                    {validationErrors.academicSession && (
                      <p className="text-[11px] text-rose-500">{validationErrors.academicSession}</p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                      <Building className="w-3.5 h-3.5 text-brand-primary" />
                      বিভাগ (Department Name) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="department"
                      value={formData.department}
                      onChange={handleInputChange}
                      disabled={loading}
                      placeholder="যেমন: দর্শন বিভাগ"
                      className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-1 transition-all text-slate-900"
                    />
                    {validationErrors.department && (
                      <p className="text-[11px] text-rose-500">{validationErrors.department}</p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                      <School className="w-3.5 h-3.5 text-brand-primary" />
                      হলের নাম (Hall Name) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="hallName"
                      value={formData.hallName}
                      onChange={handleInputChange}
                      disabled={loading}
                      placeholder="যেমন: রোকেয়া হল"
                      className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-1 transition-all text-slate-900"
                    />
                    {validationErrors.hallName && (
                      <p className="text-[11px] text-rose-500">{validationErrors.hallName}</p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                      <IdCard className="w-3.5 h-3.5 text-brand-primary" />
                      Academic Registration ID <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="duRegistrationId"
                      value={formData.duRegistrationId}
                      onChange={handleInputChange}
                      disabled={loading}
                      placeholder="যেমন: 2019XXXXXX"
                      className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-1 transition-all text-slate-900"
                    />
                    {validationErrors.duRegistrationId && (
                      <p className="text-[11px] text-rose-500">{validationErrors.duRegistrationId}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
            )}

            {/* DU Student Details - always shown for member mode */}
            {formMode === 'member' && (
            <div className="space-y-3 bg-slate-50 p-4 md:p-5 rounded-2xl border border-slate-200/60">
              <label className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <School className="w-4 h-4 text-brand-primary" />
                ঢাকা বিশ্ববিদ্যালয়ের শিক্ষার্থীর তথ্য
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                    <GraduationCap className="w-3.5 h-3.5 text-brand-primary" />
                    শিক্ষাবর্ষ (Academic Session) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="academicSession"
                    value={formData.academicSession}
                    onChange={handleInputChange}
                    disabled={loading}
                    placeholder="যেমন: 2020-21"
                    className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-1 transition-all text-slate-900"
                  />
                  {validationErrors.academicSession && (
                    <p className="text-[11px] text-rose-500">{validationErrors.academicSession}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5 text-brand-primary" />
                    বিভাগ (Department Name) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="department"
                    value={formData.department}
                    onChange={handleInputChange}
                    disabled={loading}
                    placeholder="যেমন: দর্শন বিভাগ"
                    className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-1 transition-all text-slate-900"
                  />
                  {validationErrors.department && (
                    <p className="text-[11px] text-rose-500">{validationErrors.department}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                    <School className="w-3.5 h-3.5 text-brand-primary" />
                    হলের নাম (Hall Name) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="hallName"
                    value={formData.hallName}
                    onChange={handleInputChange}
                    disabled={loading}
                    placeholder="যেমন: রোকেয়া হল"
                    className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-1 transition-all text-slate-900"
                  />
                  {validationErrors.hallName && (
                    <p className="text-[11px] text-rose-500">{validationErrors.hallName}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                    <IdCard className="w-3.5 h-3.5 text-brand-primary" />
                    Academic Registration ID <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="duRegistrationId"
                    value={formData.duRegistrationId}
                    onChange={handleInputChange}
                    disabled={loading}
                    placeholder="যেমন: 2019XXXXXX"
                    className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-1 transition-all text-slate-900"
                  />
                  {validationErrors.duRegistrationId && (
                    <p className="text-[11px] text-rose-500">{validationErrors.duRegistrationId}</p>
                  )}
                </div>
              </div>
            </div>
            )}

            {/* Payment Method Cascade Question */}
            <div className="space-y-4 bg-slate-50 p-4 md:p-5 rounded-2xl border border-slate-200/60">
              <label className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-brand-primary" />
                পেমেন্ট পদ্ধতি নির্বাচন করুন <span className="text-rose-500">*</span>
              </label>

              <div className="grid grid-cols-2 gap-4">
                <label className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${formData.paymentMethod === 'bkash'
                  ? 'border-pink-500 bg-pink-50/50 text-pink-700 font-bold'
                  : 'border-slate-200 bg-white hover:bg-slate-100 text-slate-600'
                  }`}>
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="bkash"
                    checked={formData.paymentMethod === 'bkash'}
                    onChange={handleInputChange}
                    disabled={loading}
                    className="sr-only"
                  />
                  <span>বিকাশ (bKash)</span>
                </label>

                <label className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${formData.paymentMethod === 'nagad'
                  ? 'border-orange-500 bg-orange-50/50 text-orange-700 font-bold'
                  : 'border-slate-200 bg-white hover:bg-slate-100 text-slate-600'
                  }`}>
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="nagad"
                    checked={formData.paymentMethod === 'nagad'}
                    onChange={handleInputChange}
                    disabled={loading}
                    className="sr-only"
                  />
                  <span>নগদ (Nagad)</span>
                </label>
              </div>

              {/* Price overview summary */}
              {formMode === 'member' ? (
                <div className="bg-brand-primary-light p-5 rounded-2xl border border-brand-primary-light space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-brand-primary-dark">সদস্যপদ ফি (Membership Fee)</span>
                    <span className="font-bold text-brand-primary">১০০/-</span>
                  </div>
                  <hr className="border-slate-300" />
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-brand-primary-dark">মোট প্রদেয় ফি:</span>
                    <span className="text-2xl font-black text-brand-primary">{toBanglaNum(amount)}/-</span>
                  </div>
                </div>
              ) : (
                <>
                <div className="bg-brand-primary-light p-5 rounded-2xl border border-brand-primary-light space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-brand-primary-dark">কোর্স ফি</span>
                    {formData.isDuStudent === 'yes' ? (
                      <span className="text-slate-500"><del>৩,০০০/-</del> <span className="font-bold text-brand-primary">২,৫০০/-</span></span>
                    ) : (
                      <span className="font-bold text-brand-primary">৩,০০০/-</span>
                    )}
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-brand-primary-dark">প্ল্যাটফর্ম ও ফর্ম ফি</span>
                    {formData.isDuStudent === 'yes' ? (
                      <span className="text-slate-500"><del>১০০/-</del> <span className="font-bold text-brand-primary">৫০/-</span></span>
                    ) : (
                      <span className="font-bold text-brand-primary">১০০/-</span>
                    )}
                  </div>
                  <hr className="border-slate-300" />
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-brand-primary-dark">মোট প্রদেয় ফি:</span>
                    <span className="text-2xl font-black text-brand-primary">{toBanglaNum(amount)}/-</span>
                  </div>
                </div>
                </>
              )}

              {/* Transaction ID input field */}
              {formData.paymentMethod && (
                <div className="mt-4 pt-4 border-t border-slate-200 space-y-2">
                  <p className="text-sm text-center text-slate-600">নিম্নোক্ত নাম্বারে টাকা পাঠিয়ে (সেন্ড-মানি) ট্রানজাকশন নাম্বারটি কপি করে এখানে পেস্ট করুন।</p>
                  <div className="flex justify-center bg-white p-5 rounded-2xl border border-slate-200">
                    <span className="text-2xl font-black text-brand-primary">{formData.paymentMethod === 'nagad' ? '01839858853' : '01407604000'}</span>
                  </div>
                  <label className="text-xs font-bold text-slate-600 block mt-2">
                    Transaction ID (TrxID) লিখুন <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="transactionId"
                    value={formData.transactionId}
                    onChange={handleInputChange}
                    disabled={loading}
                    placeholder="যেমন: 8N79JFLK2"
                    className={`w-full px-4 py-2.5 rounded-lg text-sm bg-white border ${validationErrors.transactionId ? 'border-rose-400' : 'border-slate-200'
                      } focus:outline-none focus:ring-2 focus:ring-brand-primary transition-all text-slate-900`}
                  />
                  {validationErrors.transactionId && (
                    <p className="text-xs text-rose-500">{validationErrors.transactionId}</p>
                  )}
                </div>
              )}
            </div>

            {/* Submit Button / Progress Bar */}
            {loading ? (
              <div className="mt-4 space-y-3 animate-fade-in">
                <div className="w-full bg-slate-200 rounded-full h-4 overflow-hidden shadow-inner">
                  <div
                    className="h-full bg-gradient-to-r from-brand-primary to-amber-500 rounded-full transition-all duration-500 ease-out relative overflow-hidden"
                    style={{ width: `${progress}%` }}
                  >
                    {progress < 100 && (
                      <div className="absolute inset-0 bg-white/25 animate-pulse" />
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-center gap-2 text-sm font-medium text-brand-primary">
                  <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>
                    {progress === 100
                      ? 'সম্পন্ন!'
                      : progress < 30
                        ? 'তথ্য জমা দেওয়া হচ্ছে...'
                        : progress < 80
                          ? 'ইনভয়েস তৈরি করা হচ্ছে...'
                          : 'ডাউনলোড প্রস্তুত হচ্ছে...'}
                  </span>
                </div>
              </div>
            ) : success ? (
              <button
                type="button"
                onClick={() => setSuccess(false)}
                className="w-full flex items-center justify-center gap-2 mt-4 px-6 py-4 rounded-2xl text-base font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] shadow-lg shadow-emerald-600/20 transition-all duration-200"
              >
                <CheckCircle2 className="w-5 h-5" />
                আরেকটি রেজিস্ট্রেশন করুন
              </button>
            ) : (
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 mt-4 px-6 py-4 rounded-2xl text-base font-bold text-white bg-brand-primary hover:bg-brand-primary-hover active:scale-[0.99] shadow-lg shadow-brand-primary/10 transition-all duration-200"
              >
                <Download className="w-5 h-5" />
                {formMode === 'member' ? 'সদস্যপদ নিন এবং রসিদ নিন' : 'রেজিস্ট্রেশন করুন এবং রসিদ নিন'}
              </button>
            )}
          </form>
          )}
        </div>
    </main>
  );
}
