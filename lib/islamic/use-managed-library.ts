'use client'

import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import {
  mergeLibraryBook,
  mergeLibraryCatalog,
  mergeLessons,
  type ManagedBook,
  type StoredRecord,
} from './managed-library'

export function useManagedCatalog() {
  const [books, setBooks] = useState<ManagedBook[]>(() => mergeLibraryCatalog([]))
  const [ready, setReady] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let received = false
    try { const saved = JSON.parse(localStorage.getItem('samee3_library_catalog_v1') || 'null'); if (Array.isArray(saved)) setBooks(mergeLibraryCatalog(saved)) } catch {}
    const timer = setTimeout(() => { if (!received) setError('تُعرض المكتبة المحفوظة. تعذرت مزامنة التغييرات؛ أعد المحاولة عند عودة الاتصال.') }, 8000)
    const stop = onSnapshot(
        collection(db, 'islamicLibraryBooks'),
        (snapshot) => {
          received = true
          const records = snapshot.docs.map((item) => ({ id: item.id, data: item.data() }))
          setBooks(mergeLibraryCatalog(records))
          try { localStorage.setItem('samee3_library_catalog_v1', JSON.stringify(records)) } catch {}
          setReady(true)
          setError('')
        },
        () => {
          setReady(true)
          setError('تعذّر تحديث المكتبة. تحقق من الاتصال ثم أعد تحميل الصفحة.')
        },
      )
    return () => { clearTimeout(timer); stop() }
  }, [])
  return { books, ready, error }
}

export function useManagedBook(id: string | null) {
  const [state, setState] = useState<{
    id: string | null
    book: ManagedBook | null
    ready: boolean
    lessonsReady: boolean
    error: string
  }>({ id, book: null, ready: false, lessonsReady: false, error: '' })
  useEffect(() => {
    if (!id) {
      setState({ id, book: null, ready: false, lessonsReady: false, error: '' })
      return
    }
    let raw: Record<string, unknown> = {},
      lessons: StoredRecord[] = []
    let ready = false,
      lessonsReady = false,
      error = '',
      alive = true
    try {
      const saved = JSON.parse(localStorage.getItem(`samee3_library_book_v1:${id}`) || 'null')
      if (saved && typeof saved.raw === 'object' && Array.isArray(saved.lessons)) { raw = saved.raw; lessons = saved.lessons }
    } catch {}
    const publish = () => {
      if (!alive) return
      const book = mergeLibraryBook(id, raw)
      if (book) book.videos = mergeLessons(book.videos, lessons)
      setState({ id, book, ready, lessonsReady, error })
    }
    publish()
    const deadline = setTimeout(() => {
      if (!ready || !lessonsReady) {
        ready = true
        error = 'تُعرض النسخة المحفوظة من الكتاب والشرح. لم تكتمل المزامنة؛ تحقق من الاتصال قبل التعديل.'
        publish()
      }
    }, 8000)
    const persist = () => { try { localStorage.setItem(`samee3_library_book_v1:${id}`, JSON.stringify({ raw, lessons })) } catch {} }
    const stopBook = onSnapshot(
      doc(db, 'islamicLibraryBooks', id),
      (snapshot) => {
        raw = snapshot.data() || {}
        ready = true
        if (lessonsReady) error = ''
        persist()
        publish()
      },
      () => {
        ready = true
        error = 'تعذّر تحديث بيانات الكتاب. تحقق من الاتصال وأعد المحاولة.'
        publish()
      },
    )
    const stopLessons = onSnapshot(
      collection(db, 'islamicLibraryBooks', id, 'videos'),
      (snapshot) => {
        lessons = snapshot.docs.map((item) => ({ id: item.id, data: item.data() }))
        lessonsReady = true
        if (ready) error = ''
        persist()
        publish()
      },
      () => {
        lessonsReady = false
        error = 'تعذّر تحميل الدروس الحالية. أعد المحاولة قبل تعديلها.'
        publish()
      },
    )
    return () => {
      alive = false
      clearTimeout(deadline)
      stopBook()
      stopLessons()
    }
  }, [id])
  return state.id === id ? state : { id, book: null, ready: false, lessonsReady: false, error: '' }
}
