'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2, Upload, Loader2, CheckCircle, X, FileText, Image } from 'lucide-react'
import type { Sector, Source, Stage, FounderRole, BusinessModelType, FundraisingPlan, PatentStatus, ApplicationFormData, Founder } from '@/lib/types'
import type { Lang } from '@/lib/translations'
import { getTranslations, getDropdownLabels } from '@/lib/translations'

const SECTORS: Sector[] = [
  'AI', 'Fintech', 'Health', 'E-commerce', 'EdTech', 'Gaming',
  'Tourism Tech', 'CleanTech', 'AgriTech', 'PropTech', 'MedTech',
  'Logistics', 'SaaS', 'Marketplace', 'IoT', 'Cybersecurity', 'RetailTech', 'Other',
]
const SOURCES: Source[] = [
  'LinkedIn', 'Google', 'Social Media', 'Event', 'Recommendation',
  'University', 'Press/Media', 'Newsletter', 'Partner', 'Other',
]
const STAGES: Stage[] = ['Idea', 'Prototype', 'MVP', 'Product launched', 'Traction']
const ROLES: FounderRole[] = ['CEO', 'CTO', 'COO', 'CFO', 'CMO', 'CPO', 'Business Developer', 'Developer', 'Designer', 'Marketing', 'Operations', 'Other']

const emptyFounder = (isPrimary: boolean): Founder => ({
  full_name: '',
  email: '',
  phone: '',
  role: 'CEO',
  linkedin: '',
  is_primary: isPrimary,
})

interface AdditionalDoc {
  name: string
  file: File
}

export default function ApplicationForm({ lang = 'en' }: { lang?: Lang }) {
  const t = getTranslations(lang)
  const d = getDropdownLabels(lang)
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [duplicateWarning, setDuplicateWarning] = useState(false)
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false)
  const [showErrors, setShowErrors] = useState(false)

  // Form state
  const [startupName, setStartupName] = useState('')
  const [creationDate, setCreationDate] = useState('')
  const [website, setWebsite] = useState('')
  const [linkedinPage, setLinkedinPage] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [sector, setSector] = useState<Sector>('AI')
  const [source, setSource] = useState<Source | ''>('')
  const [description, setDescription] = useState('')
  const [customers, setCustomers] = useState('')
  const [businessModel, setBusinessModel] = useState('')
  const [businessModelType, setBusinessModelType] = useState<BusinessModelType>('B2B')
  const [stage, setStage] = useState<Stage>('Idea')
  const [founders, setFounders] = useState<Founder[]>([emptyFounder(true)])
  const [revenue, setRevenue] = useState('')
  const [projectedRevenue, setProjectedRevenue] = useState('')
  const [employees, setEmployees] = useState('')
  const [usersOrCustomers, setUsersOrCustomers] = useState('')
  const [raisedFunds, setRaisedFunds] = useState(false)
  const [fundsAmount, setFundsAmount] = useState('')
  const [fundraisingPlan, setFundraisingPlan] = useState<FundraisingPlan>('No')
  const [patentStatus, setPatentStatus] = useState<PatentStatus>('No')
  const [totalInvestment, setTotalInvestment] = useState('')

  // File state
  const [pitchDeck, setPitchDeck] = useState<File | null>(null)
  const [businessPlan, setBusinessPlan] = useState<File | null>(null)
  const [additionalDocs, setAdditionalDocs] = useState<AdditionalDoc[]>([])
  const [showAddDocModal, setShowAddDocModal] = useState(false)
  const [newDocName, setNewDocName] = useState('')
  const [newDocFile, setNewDocFile] = useState<File | null>(null)

  const stepLabels = [t.stepStartupInfo, t.stepFounders, t.stepTraction, t.stepDocuments, t.stepSubmit]

  const inputClass = (hasError: boolean) =>
    `w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
      hasError ? 'border-red-400 bg-red-50' : 'border-gray-300'
    }`

  const handleLogoChange = (file: File | null) => {
    setLogoFile(file)
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => setLogoPreview(e.target?.result as string)
      reader.readAsDataURL(file)
    } else {
      setLogoPreview(null)
    }
  }

  const addFounder = () => {
    if (founders.length < 4) {
      setFounders([...founders, emptyFounder(false)])
    }
  }

  const removeFounder = (index: number) => {
    if (index === 0) return
    setFounders(founders.filter((_, i) => i !== index))
  }

  const updateFounder = (index: number, field: keyof Founder, value: string | boolean) => {
    const updated = [...founders]
    updated[index] = { ...updated[index], [field]: value }
    setFounders(updated)
  }

  const validateStep = (s: number): boolean => {
    if (s === 1) {
      return startupName.trim() !== '' && description.trim() !== ''
    }
    if (s === 2) {
      const primary = founders[0]
      return primary.full_name.trim() !== '' && primary.email.trim() !== '' && primary.phone.trim() !== ''
    }
    return true
  }

  const nextStep = () => {
    if (!validateStep(step)) {
      setError(t.fillRequired)
      setShowErrors(true)
      return
    }
    setError('')
    setShowErrors(false)
    setStep(step + 1)
  }

  const prevStep = () => {
    setError('')
    setStep(step - 1)
  }

  const checkDuplicate = async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/applications/duplicate-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startup_name: startupName,
          founder_emails: founders.map(f => f.email).filter(Boolean),
        }),
      })
      const data = await res.json()
      return data.isDuplicate
    } catch {
      return false
    }
  }

  const uploadFile = async (file: File, type: string, applicationId: string): Promise<string | null> => {
    const supabase = createClient()
    const ext = file.name.split('.').pop()
    const path = `${applicationId}/${type}_${Date.now()}.${ext}`

    const { error } = await supabase.storage.from('documents').upload(path, file)
    if (error) {
      console.error('Upload error:', error)
      return null
    }

    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
    return urlData.publicUrl
  }

  const handleAddDoc = () => {
    if (newDocName.trim() && newDocFile) {
      setAdditionalDocs([...additionalDocs, { name: newDocName.trim(), file: newDocFile }])
      setNewDocName('')
      setNewDocFile(null)
      setShowAddDocModal(false)
    }
  }

  const removeAdditionalDoc = (index: number) => {
    setAdditionalDocs(additionalDocs.filter((_, i) => i !== index))
  }

  const handleSubmit = async () => {
    if (!validateStep(1) || !validateStep(2)) {
      setError(t.fillRequired)
      setShowErrors(true)
      return
    }

    if (!duplicateConfirmed) {
      const isDuplicate = await checkDuplicate()
      if (isDuplicate) {
        setDuplicateWarning(true)
        return
      }
    }

    setSubmitting(true)
    setError('')

    try {
      // Upload logo first if present
      let logoUrl: string | undefined
      if (logoFile) {
        const supabase = createClient()
        const ext = logoFile.name.split('.').pop()
        const logoPath = `logos/${Date.now()}.${ext}`
        const { error: logoErr } = await supabase.storage.from('documents').upload(logoPath, logoFile)
        if (!logoErr) {
          const { data: urlData } = supabase.storage.from('documents').getPublicUrl(logoPath)
          logoUrl = urlData.publicUrl
        }
      }

      const formData: ApplicationFormData = {
        startup_name: startupName,
        creation_date: creationDate || undefined,
        website: website || undefined,
        linkedin_page: linkedinPage || undefined,
        logo_url: logoUrl,
        sector,
        source: source || 'Other',
        description,
        customers: customers || undefined,
        business_model: businessModel || undefined,
        business_model_type: businessModelType,
        stage,
        revenue_last_12_months: revenue || undefined,
        projected_revenue_next_12_months: projectedRevenue || undefined,
        employees: employees || undefined,
        users_or_customers: usersOrCustomers || undefined,
        raised_funds: raisedFunds,
        funds_amount: raisedFunds ? fundsAmount || undefined : undefined,
        fundraising_plan: fundraisingPlan,
        patent_status: patentStatus,
        total_investment: totalInvestment || undefined,
        founders,
      }

      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Failed to submit application')
      }

      const { applicationId } = await res.json()

      // Upload files
      const supabase = createClient()
      const fileUploads: { file: File; type: string; customName?: string }[] = []
      if (pitchDeck) fileUploads.push({ file: pitchDeck, type: 'pitch_deck' })
      if (businessPlan) fileUploads.push({ file: businessPlan, type: 'business_plan' })
      for (const doc of additionalDocs) {
        fileUploads.push({ file: doc.file, type: 'additional', customName: doc.name })
      }

      for (const { file, type, customName } of fileUploads) {
        const url = await uploadFile(file, type, applicationId)
        if (url) {
          await supabase.from('documents').insert({
            application_id: applicationId,
            file_url: url,
            file_name: file.name,
            file_type: type,
            ...(customName ? { custom_name: customName } : {}),
          })
        }
      }

      setSubmitted(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : t.somethingWentWrong
      setError(msg)
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  const confirmDuplicate = () => {
    setDuplicateWarning(false)
    setDuplicateConfirmed(true)
    handleSubmit()
  }

  if (submitted) {
    return (
      <div className="text-center py-20">
        <CheckCircle className="mx-auto mb-4 text-green-600" size={48} />
        <h2 className="text-2xl font-bold mb-2">{t.applicationSubmitted}</h2>
        <p className="text-gray-600">{t.thankYou}</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress */}
      <div className="flex items-center justify-between mb-8">
        {stepLabels.map((label, i) => (
          <div key={i} className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step > i + 1
                  ? 'bg-green-600 text-white'
                  : step === i + 1
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-500'
              }`}
            >
              {step > i + 1 ? '✓' : i + 1}
            </div>
            <span className={`ml-2 text-sm hidden sm:inline ${step === i + 1 ? 'font-medium' : 'text-gray-500'}`}>
              {label}
            </span>
            {i < 4 && <div className="w-8 sm:w-12 h-px bg-gray-300 mx-2" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Duplicate warning modal */}
      {duplicateWarning && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <h3 className="text-lg font-bold mb-2">{t.possibleDuplicate}</h3>
            <p className="text-gray-600 mb-4">{t.duplicateMessage}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDuplicateWarning(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                {t.cancel}
              </button>
              <button
                onClick={confirmDuplicate}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                {t.submitAnyway}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Document Modal */}
      {showAddDocModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">{t.addDocument}</h3>
              <button onClick={() => { setShowAddDocModal(false); setNewDocName(''); setNewDocFile(null) }} className="text-gray-400 hover:text-blue-700">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t.documentName}</label>
                <input
                  type="text"
                  value={newDocName}
                  onChange={(e) => setNewDocName(e.target.value)}
                  placeholder={t.documentNamePlaceholder}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t.file}</label>
                <label className="flex items-center gap-3 border border-dashed border-gray-300 rounded-lg p-4 cursor-pointer hover:border-gray-400 transition-colors">
                  <Upload size={20} className="text-gray-400" />
                  <span className="text-sm text-gray-500">
                    {newDocFile ? newDocFile.name : t.clickToUpload}
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
                    onChange={(e) => setNewDocFile(e.target.files?.[0] || null)}
                  />
                </label>
              </div>
              <button
                onClick={handleAddDoc}
                disabled={!newDocName.trim() || !newDocFile}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {t.add}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 1: Startup Info */}
      {step === 1 && (
        <div className="space-y-5">
          <h2 className="text-xl font-semibold mb-4">{t.startupInformation}</h2>

          <div>
            <label className={`block text-sm font-medium mb-1 ${showErrors && !startupName.trim() ? 'text-red-600' : ''}`}>{t.startupName} *</label>
            <input
              type="text"
              value={startupName}
              onChange={(e) => setStartupName(e.target.value)}
              className={inputClass(showErrors && !startupName.trim())}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t.logo}</label>
            <div className="flex items-center gap-4">
              {logoPreview ? (
                <div className="relative">
                  <img src={logoPreview} alt="Logo preview" className="w-16 h-16 rounded-full object-cover border border-gray-200" />
                  <button
                    onClick={() => handleLogoChange(null)}
                    className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <label className="w-16 h-16 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-gray-400 transition-colors">
                  <Image size={20} className="text-gray-400" />
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={(e) => handleLogoChange(e.target.files?.[0] || null)}
                  />
                </label>
              )}
              <span className="text-xs text-gray-500">{t.logoHint}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t.creationDate}</label>
              <input
                type="date"
                value={creationDate}
                onChange={(e) => setCreationDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t.sector} *</label>
              <select
                value={sector}
                onChange={(e) => setSector(e.target.value as Sector)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {SECTORS.map(s => <option key={s} value={s}>{d.sectors[s]}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t.website}</label>
            <input
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t.linkedinPage}</label>
            <input
              type="url"
              value={linkedinPage}
              onChange={(e) => setLinkedinPage(e.target.value)}
              placeholder="https://linkedin.com/company/..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className={`block text-sm font-medium mb-1 ${showErrors && !description.trim() ? 'text-red-600' : ''}`}>{t.shortDescription} *</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className={`${inputClass(showErrors && !description.trim())} resize-none`}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t.whoAreYourCustomers}</label>
            <textarea
              value={customers}
              onChange={(e) => setCustomers(e.target.value)}
              rows={2}
              placeholder={t.describeCustomers}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t.businessModelLabel}</label>
            <textarea
              value={businessModel}
              onChange={(e) => setBusinessModel(e.target.value)}
              rows={2}
              placeholder={t.businessModelPlaceholder}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t.model} *</label>
              <select
                value={businessModelType}
                onChange={(e) => setBusinessModelType(e.target.value as BusinessModelType)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="B2B">{d.businessModelTypes['B2B']}</option>
                <option value="B2C">{d.businessModelTypes['B2C']}</option>
                <option value="Both">{d.businessModelTypes['Both']}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t.stageMaturity} *</label>
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value as Stage)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {STAGES.map(s => <option key={s} value={s}>{d.stages[s]}</option>)}
              </select>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={nextStep}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              {t.next}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Founders */}
      {step === 2 && (
        <div className="space-y-5">
          <h2 className="text-xl font-semibold mb-4">{t.founders}</h2>

          {founders.map((founder, index) => (
            <div key={index} className="border border-gray-200 rounded-lg p-4 space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-medium">
                  {index === 0 ? `${t.leadFounder} *` : `${t.coFounder} ${index + 1}`}
                </h3>
                {index > 0 && (
                  <button
                    onClick={() => removeFounder(index)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-sm mb-1 ${showErrors && index === 0 && !founder.full_name.trim() ? 'text-red-600' : 'text-gray-600'}`}>{t.fullName} {index === 0 && '*'}</label>
                  <input
                    type="text"
                    value={founder.full_name}
                    onChange={(e) => updateFounder(index, 'full_name', e.target.value)}
                    className={`${inputClass(showErrors && index === 0 && !founder.full_name.trim())} text-sm`}
                  />
                </div>
                <div>
                  <label className={`block text-sm mb-1 ${showErrors && index === 0 && !founder.email.trim() ? 'text-red-600' : 'text-gray-600'}`}>{t.email} {index === 0 && '*'}</label>
                  <input
                    type="email"
                    value={founder.email}
                    onChange={(e) => updateFounder(index, 'email', e.target.value)}
                    className={`${inputClass(showErrors && index === 0 && !founder.email.trim())} text-sm`}
                  />
                </div>
                <div>
                  <label className={`block text-sm mb-1 ${showErrors && index === 0 && !founder.phone.trim() ? 'text-red-600' : 'text-gray-600'}`}>{t.phone} {index === 0 && '*'}</label>
                  <input
                    type="tel"
                    value={founder.phone}
                    onChange={(e) => updateFounder(index, 'phone', e.target.value)}
                    className={`${inputClass(showErrors && index === 0 && !founder.phone.trim())} text-sm`}
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">{t.role}</label>
                  <select
                    value={founder.role}
                    onChange={(e) => updateFounder(index, 'role', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {ROLES.map(r => <option key={r} value={r}>{d.roles[r]}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">{t.linkedin}</label>
                <input
                  type="url"
                  value={founder.linkedin || ''}
                  onChange={(e) => updateFounder(index, 'linkedin', e.target.value)}
                  placeholder="https://linkedin.com/in/..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          ))}

          {founders.length < 4 && (
            <button
              onClick={addFounder}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-700"
            >
              <Plus size={16} /> {t.addCoFounder}
            </button>
          )}

          <div className="flex justify-between">
            <button onClick={prevStep} className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
              {t.back}
            </button>
            <button onClick={nextStep} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              {t.next}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Traction */}
      {step === 3 && (
        <div className="space-y-5">
          <h2 className="text-xl font-semibold mb-4">{t.tractionInformation}</h2>
          <p className="text-sm text-gray-500 mb-4">{t.tractionHint}</p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t.revenueLast12}</label>
              <input
                type="number"
                min="0"
                value={revenue}
                onChange={(e) => setRevenue(e.target.value)}
                placeholder="e.g. 500000"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t.projectedRevenue}</label>
              <input
                type="number"
                min="0"
                value={projectedRevenue}
                onChange={(e) => setProjectedRevenue(e.target.value)}
                placeholder="e.g. 1000000"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t.numberOfEmployees}</label>
            <input
              type="number"
              min="0"
              value={employees}
              onChange={(e) => setEmployees(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t.numberOfUsers}</label>
            <input
              type="number"
              min="0"
              value={usersOrCustomers}
              onChange={(e) => setUsersOrCustomers(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t.haveYouRaisedFunds}</label>
            <div className="flex gap-4 mt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={!raisedFunds}
                  onChange={() => setRaisedFunds(false)}
                  className="accent-blue-600"
                />
                {t.no}
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={raisedFunds}
                  onChange={() => setRaisedFunds(true)}
                  className="accent-blue-600"
                />
                {t.yes}
              </label>
            </div>
          </div>

          {raisedFunds && (
            <div>
              <label className="block text-sm font-medium mb-1">{t.amountRaised}</label>
              <input
                type="number"
                min="0"
                value={fundsAmount}
                onChange={(e) => setFundsAmount(e.target.value)}
                placeholder="e.g. 2000000"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t.planningToRaise}</label>
              <select
                value={fundraisingPlan}
                onChange={(e) => setFundraisingPlan(e.target.value as FundraisingPlan)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="No">{d.fundraisingPlans['No']}</option>
                <option value="In 6 months">{d.fundraisingPlans['In 6 months']}</option>
                <option value="In 12 months">{d.fundraisingPlans['In 12 months']}</option>
                <option value="In 18 months">{d.fundraisingPlans['In 18 months']}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t.doYouHavePatent}</label>
              <select
                value={patentStatus}
                onChange={(e) => setPatentStatus(e.target.value as PatentStatus)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="No">{d.patentStatuses['No']}</option>
                <option value="Yes">{d.patentStatuses['Yes']}</option>
                <option value="In Progress">{d.patentStatuses['In Progress']}</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t.totalInvestment}</label>
            <input
              type="number"
              min="0"
              value={totalInvestment}
              onChange={(e) => setTotalInvestment(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex justify-between">
            <button onClick={prevStep} className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
              {t.back}
            </button>
            <button onClick={nextStep} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              {t.next}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Documents */}
      {step === 4 && (
        <div className="space-y-5">
          <h2 className="text-xl font-semibold mb-4">{t.documents}</h2>

          <FileUpload
            label={t.pitchDeck}
            file={pitchDeck}
            onFile={setPitchDeck}
            clickToUploadLabel={t.clickToUpload}
            removeLabel={t.remove}
          />
          <FileUpload
            label={t.businessPlanDoc}
            file={businessPlan}
            onFile={setBusinessPlan}
            clickToUploadLabel={t.clickToUpload}
            removeLabel={t.remove}
          />

          {/* Additional Documents */}
          <div>
            <label className="block text-sm font-medium mb-2">{t.additionalDocuments}</label>
            {additionalDocs.length > 0 && (
              <div className="space-y-2 mb-3">
                {additionalDocs.map((doc, i) => (
                  <div key={i} className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 text-sm">
                      <FileText size={16} className="text-gray-400" />
                      <span className="font-medium">{doc.name}</span>
                      <span className="text-gray-400">({doc.file.name})</span>
                    </div>
                    <button onClick={() => removeAdditionalDoc(i)} className="text-red-500 hover:text-red-700">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowAddDocModal(true)}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-700 border border-dashed border-gray-300 rounded-lg px-4 py-2 hover:border-gray-400 transition-colors"
            >
              <Plus size={16} />
              {t.addDocument}
            </button>
          </div>

          <div className="flex justify-between pt-4">
            <button onClick={prevStep} className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
              {t.back}
            </button>
            <button onClick={nextStep} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              {t.next}
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Submit */}
      {step === 5 && (
        <div className="space-y-5">
          <h2 className="text-xl font-semibold mb-4">{t.submitYourApplication}</h2>

          <div>
            <label className="block text-sm font-medium mb-1">{t.howDidYouHear}</label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as Source)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="" disabled>{t.selectOption}</option>
              {SOURCES.map(s => <option key={s} value={s}>{d.sources[s]}</option>)}
            </select>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p
              className="text-sm text-gray-700 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: t.confidentialityText }}
            />
          </div>

          <div className="flex justify-between pt-4">
            <button onClick={prevStep} className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
              {t.back}
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-8 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {submitting && <Loader2 size={16} className="animate-spin" />}
              {submitting ? t.submitting : t.submitApplication}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function FileUpload({
  label,
  file,
  onFile,
  clickToUploadLabel = 'Click to upload',
  removeLabel = 'Remove',
}: {
  label: string
  file: File | null
  onFile: (f: File | null) => void
  clickToUploadLabel?: string
  removeLabel?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <label className="flex items-center gap-3 border border-dashed border-gray-300 rounded-lg p-4 cursor-pointer hover:border-gray-400 transition-colors">
        <Upload size={20} className="text-gray-400" />
        <span className="text-sm text-gray-500">
          {file ? file.name : clickToUploadLabel}
        </span>
        <input
          type="file"
          className="hidden"
          accept=".pdf,.doc,.docx,.ppt,.pptx"
          onChange={(e) => onFile(e.target.files?.[0] || null)}
        />
      </label>
      {file && (
        <button
          onClick={() => onFile(null)}
          className="text-xs text-red-500 mt-1 hover:underline"
        >
          {removeLabel}
        </button>
      )}
    </div>
  )
}
