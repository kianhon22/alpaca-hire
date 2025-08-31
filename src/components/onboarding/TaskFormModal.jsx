'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from '@/components/ui/form';

import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue
} from "@/components/ui/select";

const MALAYSIAN_BANKS = [
  'Maybank (Malayan Banking Berhad)','CIMB Bank','Public Bank','RHB Bank','Hong Leong Bank',
  'AmBank','UOB Malaysia','OCBC Bank (Malaysia)','HSBC Bank Malaysia','Alliance Bank',
  'Affin Bank','Bank Islam','Bank Rakyat','Agrobank','BSN (Bank Simpanan Nasional)',
];

export default function TaskFormModal({
  open,
  onClose,
  userUid,
  task,               // { label, kind: 'personal_details' | 'bank_info' }
  completionKey,
  onSaved,
}) {
  const isPersonal = task?.kind === 'personal_details';
  const isBank = task?.kind === 'bank_info';

  const defaultValues = useMemo(
    () => (isPersonal
      ? { firstName: '', lastName: '', phone: '', address: '' }
      : { bankName: '', accountName: '', accountNumber: '' }),
    [isPersonal]
  );

  const methods = useForm({ defaultValues, mode: 'onTouched' });
  const { control, handleSubmit, reset, formState: { isSubmitting } } = methods;

  const [loadingPrev, setLoadingPrev] = useState(false);
  const [submitted, setSubmitted] = useState(false); // has a saved "done" submission
  const [editing, setEditing] = useState(false);     // edit mode only after submitted
  const viewOnly = submitted && !editing;
  const dis = viewOnly || isSubmitting;

  // Load previous submission (if any)
  useEffect(() => {
    let alive = true;
    async function run() {
      if (!open || !userUid || !completionKey) return;
      setLoadingPrev(true);
      try {
        const ref = doc(db, 'userOnboarding', userUid, 'tasks', completionKey);
        const snap = await getDoc(ref);
        if (!alive) return;

        if (snap.exists()) {
          const data = snap.data();
          setSubmitted(data?.status === 'done');
          reset({ ...defaultValues, ...(data?.submission || {}) });
        } else {
          setSubmitted(false);
          reset(defaultValues);
        }
        setEditing(false);
      } finally {
        if (alive) setLoadingPrev(false);
      }
    }
    run();
    return () => { alive = false; };
  }, [open, userUid, completionKey, reset, defaultValues]);

  async function onSubmit(values) {
    const payload = {
      status: 'done',
      updatedAt: serverTimestamp(),
      kind: task?.kind || '',
      submission: values,
    };
    await setDoc(doc(db, 'userOnboarding', userUid, 'tasks', completionKey), payload, { merge: true });
    setSubmitted(true);
    setEditing(false);
    onSaved?.();
    onClose();
  }

  if (!open) return null;
  const title = task?.label || 'Task';
  const inputCls = (disabled) => `border rounded-lg px-3 py-2 ${disabled ? 'bg-gray-50' : ''}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          {/* top-right close removed */}
        </div>

        {loadingPrev ? (
          <div className="text-sm text-gray-500 mb-4">Loading…</div>
        ) : (
          <Form {...methods}>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* PERSONAL DETAILS */}
              {isPersonal && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <FormField
                    control={control}
                    name="firstName"
                    rules={{ required: 'First name is required' }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First name</FormLabel>
                        <FormControl>
                          <input {...field} className={inputCls(dis)} placeholder="First name" disabled={dis} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={control}
                    name="lastName"
                    rules={{ required: 'Last name is required' }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last name</FormLabel>
                        <FormControl>
                          <input {...field} className={inputCls(dis)} placeholder="Last name" disabled={dis} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={control}
                    name="phone"
                    rules={{ required: 'Phone number is required' }}
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Mobile number</FormLabel>
                        <FormControl>
                          <input
                            {...field}
                            inputMode="tel"
                            className={inputCls(dis)}
                            placeholder="e.g., 0123456789"
                            disabled={dis}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={control}
                    name="address"
                    rules={{ required: 'Address is required' }}
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Residential address</FormLabel>
                        <FormControl>
                          <input
                            {...field}
                            className={inputCls(dis)}
                            placeholder="Street, city, state, postcode"
                            disabled={dis}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {/* BANK INFO (Malaysia) */}
              {isBank && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <FormField
                    control={control}
                    name="bankName"
                    rules={{ required: 'Please select a bank' }}
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Bank</FormLabel>
                        <FormControl>
                            <Select
                            onValueChange={field.onChange}
                            value={field.value}
                            disabled={dis}
                            >
                            <SelectTrigger className={`w-full border rounded-lg px-3 py-2 ${dis ? 'bg-gray-50' : ''}`}>
                                <SelectValue placeholder="Select your bank" />
                            </SelectTrigger>
                            <SelectContent side="bottom"> {/* 👈 force dropdown below */}
                                {MALAYSIAN_BANKS.map((b) => (
                                <SelectItem key={b} value={b}>
                                    {b}
                                </SelectItem>
                                ))}
                            </SelectContent>
                            </Select>
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                  <FormField
                    control={control}
                    name="accountName"
                    rules={{ required: 'Account holder name is required' }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Account holder name</FormLabel>
                        <FormControl>
                          <input
                            {...field}
                            className={inputCls(dis)}
                            placeholder="As per bank records"
                            title="Exactly as shown in your bank account."
                            disabled={dis}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={control}
                    name="accountNumber"
                    rules={{ required: 'Account number is required' }}
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Account number</FormLabel>
                        <FormControl>
                          <input
                            {...field}
                            className={inputCls(dis)}
                            inputMode="numeric"
                            placeholder="Digits only"
                            title="Bank account number for salary crediting."
                            disabled={dis}
                            onChange={(e) => field.onChange(e.target.value.replace(/\D/g, ''))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {/* Actions */}
              <div className="mt-6 flex items-center justify-end gap-2">
                <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg border">
                  Close
                </button>

                {/* Before first submission: only Submit */}
                {!submitted && (
                  <button
                    type="submit"
                    disabled={dis}
                    className="px-3 py-1.5 rounded-lg bg-black text-white disabled:opacity-60"
                  >
                    {isSubmitting ? 'Submitting…' : 'Submit'}
                  </button>
                )}

                {/* After submission, not editing: only Edit */}
                {submitted && !editing && (
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="px-3 py-1.5 rounded-lg border bg-black text-white"
                  >
                    Edit
                  </button>
                )}

                {/* After submission, editing: show Cancel + Save changes */}
                {submitted && editing && (
                  <>
                    <button
                      type="button"
                      onClick={() => setEditing(false)}
                      className="px-3 py-1.5 rounded-lg border"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-3 py-1.5 rounded-lg bg-black text-white disabled:opacity-60"
                    >
                      {isSubmitting ? 'Saving…' : 'Save changes'}
                    </button>
                  </>
                )}
              </div>
            </form>
          </Form>
        )}
      </div>
    </div>
  );
}
