'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Activity,
  ArrowLeft,
  BookOpen,
  CheckCheck,
  Headphones,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react'
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  type Timestamp,
} from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import AdminGate from '@/components/AdminGate'
import IslamicLibraryAdmin from '@/components/admin/IslamicLibraryAdmin'
import AppStatistics from '@/components/admin/AppStatistics'
import { useAuth } from '@/context/AuthContext'
import { auth, db } from '@/lib/firebase'
import { recoverSupportConversations, sendSupportMessage, subscribeSupportMessages, supportMessageError, type SupportMessage } from '@/lib/support-messages'

type Tab =
  | 'dashboard'
  | 'users'
  | 'messages'
  | 'library'
  | 'content'

type UserRecord = {
  id: string
  name: string
  email: string
  status: string
  role: string
  lastReadPage: number
  khatmaDays: number | null
  fields: Record<string, unknown>
}

type Conversation = {
  id: string
  userName: string
  userEmail: string
  lastMessage: string
  lastSenderId: string
  unreadForAdmin: boolean
  updatedAt: unknown
}

type Message = SupportMessage

const MENU: {
  id: Tab
  label: string
  icon: typeof Users
}[] = [
  {
    id: 'dashboard',
    label: 'لوحة التحكم',
    icon: LayoutDashboard,
  },
  {
    id: 'users',
    label: 'المستخدمون',
    icon: Users,
  },
  {
    id: 'messages',
    label: 'الرسائل',
    icon: MessageCircle,
  },
  {
    id: 'library',
    label: 'المكتبة الشرعية',
    icon: BookOpen,
  },
  {
    id: 'content',
    label: 'أقسام التطبيق',
    icon: Activity,
  },
]

function textField(
  value: unknown,
  fallback = '',
): string {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : fallback
}

function toMillis(value: unknown): number {
  if (
    value &&
    typeof value === 'object' &&
    'toMillis' in value
  ) {
    const fn = (
      value as { toMillis?: unknown }
    ).toMillis

    if (typeof fn === 'function') {
      try {
        return (value as Timestamp).toMillis()
      } catch {
        return 0
      }
    }
  }

  return 0
}

function formatTime(value: unknown): string {
  const timestamp = toMillis(value)

  if (!timestamp) return 'الآن'

  return new Intl.DateTimeFormat('ar-EG', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(timestamp))
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '—'
  }

  if (typeof value === 'boolean') {
    return value ? 'نعم' : 'لا'
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number'
  ) {
    return String(value)
  }

  if (toMillis(value)) {
    return formatTime(value)
  }

  if (Array.isArray(value)) {
    return `${value.length} عناصر`
  }

  return 'بيانات مركبة'
}

function AdminDashboard() {
  const { user, isAdmin } = useAuth()
  const router = useRouter()

  const [tab, setTab] = useState<Tab>('dashboard')
  const [menuOpen, setMenuOpen] = useState(false)

  const [users, setUsers] = useState<UserRecord[]>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [usersError, setUsersError] = useState('')
  const [searchUsers, setSearchUsers] = useState('')
  const [selectedUser, setSelectedUser] =
    useState<UserRecord | null>(null)

  const [threads, setThreads] = useState<Conversation[]>([])
  const [threadsLoading, setThreadsLoading] = useState(true)
  const [threadsError, setThreadsError] = useState('')
  const [inboxRevision, setInboxRevision] = useState(0)
  const [threadsFromCache, setThreadsFromCache] = useState(true)
  const [recovering, setRecovering] = useState(false)
  const [recoveryNotice, setRecoveryNotice] = useState('')
  const [slowSending, setSlowSending] = useState(false)
  const [threadSearch, setThreadSearch] = useState('')
  const [selectedThreadId, setSelectedThreadId] =
    useState<string | null>(null)

  const [messages, setMessages] = useState<Message[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [messageError, setMessageError] = useState('')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  const recoveryController = useRef<AbortController | null>(null)
  const sendingRef = useRef(false)
  const selectedThreadRef = useRef(selectedThreadId)
  selectedThreadRef.current = selectedThreadId
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const refreshUsers = async () => {
    setUsersLoading(true)
    setUsersError('')

    try {
      const snapshot = await getDocs(
        collection(db, 'users'),
      )

      const list: UserRecord[] = snapshot.docs.map(
        (entry) => {
          const data = entry.data() as Record<string, unknown>

          const page =
            typeof data.lastReadPage === 'number'
              ? Math.max(
                  0,
                  Math.min(604, data.lastReadPage),
                )
              : 0

          return {
            id: entry.id,
            name: textField(
              data.name,
              textField(data.displayName, 'مستخدم'),
            ),
            email: textField(
              data.email,
              'لا يوجد بريد محفوظ',
            ),
            status: textField(
              data.status,
              'غير محدد',
            ),
            role: textField(data.role, 'user'),
            lastReadPage: page,
            khatmaDays:
              typeof data.khatmaDays === 'number'
                ? data.khatmaDays
                : null,
            fields: data,
          }
        },
      )

      setUsers(
        list.sort((a, b) =>
          a.name.localeCompare(b.name, 'ar'),
        ),
      )
    } catch (error) {
      console.error('Admin users load:', error)
      setUsersError(
        'تعذر قراءة المستخدمين. تحقق من أن حسابك يحمل role = admin في Firestore.',
      )
    } finally {
      setUsersLoading(false)
    }
  }

  useEffect(() => {
    if (isAdmin && user?.uid) void refreshUsers()
  }, [isAdmin, user?.uid])

  useEffect(() => () => recoveryController.current?.abort(), [])

  useEffect(() => {
    setSlowSending(false)
    if (!sending) return
    const timeout = window.setTimeout(() => setSlowSending(true), 12_000)
    return () => window.clearTimeout(timeout)
  }, [sending])

  useEffect(() => {
    if (!isAdmin || !user?.uid) return
    setThreadsLoading(true); setThreadsError('')
    const unsubscribe = onSnapshot(
      collection(db, 'conversations'),
      { includeMetadataChanges: true },
      (snapshot) => {
        setThreadsFromCache(snapshot.metadata.fromCache)
        const next = snapshot.docs.map(
          (entry): Conversation => {
            const data = entry.data() as Record<string, unknown>

            return {
              id: entry.id,
              userName: textField(
                data.userName,
                'مستخدم مصحف سميع',
              ),
              userEmail: textField(data.userEmail),
              lastMessage: textField(data.lastMessage),
              lastSenderId: textField(data.lastSenderId),
              unreadForAdmin:
                data.unreadForAdmin === true,
              updatedAt: data.updatedAt,
            }
          },
        )

        next.sort(
          (a, b) =>
            toMillis(b.updatedAt) -
            toMillis(a.updatedAt),
        )

        setThreads(next)
        setThreadsLoading(false)
        setThreadsError('')
      },
      (error) => {
        console.error('Admin conversations:', error)
        setThreadsLoading(false)
        setThreadsError(
          supportMessageError(error, true),
        )
      },
    )

    return () => unsubscribe()
  }, [isAdmin, user?.uid, inboxRevision])

  useEffect(() => {
    setMessages([]); setMessageError('')
    if (!selectedThreadId || !user?.uid || !isAdmin) { setMessagesLoading(false); return }
    setMessagesLoading(true)
    return subscribeSupportMessages(db, selectedThreadId, (next) => {
      setMessages(next); setMessagesLoading(false)
    }, (cause) => {
      console.error('Admin messages:', cause)
      setMessagesLoading(false); setMessageError(supportMessageError(cause, true))
    }, 'admin')
  }, [selectedThreadId, user?.uid, isAdmin, inboxRevision])

  const recoverMessages = async () => {
    if (recovering || !isAdmin) return
    const controller = new AbortController(); recoveryController.current = controller
    setRecovering(true); setThreadsError(''); setRecoveryNotice('جارٍ فحص المحادثات القديمة…')
    try {
      const result = await recoverSupportConversations(db, (scanned, recovered) => {
        if (!controller.signal.aborted) setRecoveryNotice(`فُحصت ${scanned.toLocaleString('ar-EG')} رسالة؛ استُعيدت ${recovered.toLocaleString('ar-EG')} محادثة.`)
      }, controller.signal)
      if (!controller.signal.aborted) setRecoveryNotice(result.recovered ? `اكتملت المراجعة واستُعيدت ${result.recovered.toLocaleString('ar-EG')} محادثة غير ظاهرة.` : 'اكتملت المراجعة؛ لم نجد محادثات مفقودة من الصندوق.')
    } catch (cause) { if (!controller.signal.aborted) { console.error('Recover conversations:', cause); setThreadsError(supportMessageError(cause, true)) } }
    finally { if (!controller.signal.aborted) setRecovering(false) }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      block: 'end',
    })
  }, [messages.length, selectedThreadId])

  const filteredUsers = useMemo(() => {
    const term = searchUsers.trim().toLowerCase()

    return users.filter((item) =>
      `${item.name} ${item.email} ${item.id}`
        .toLowerCase()
        .includes(term),
    )
  }, [users, searchUsers])

  const filteredThreads = useMemo(() => {
    const term = threadSearch.trim().toLowerCase()

    return threads.filter((item) =>
      `${item.userName} ${item.userEmail} ${item.lastMessage}`
        .toLowerCase()
        .includes(term),
    )
  }, [threads, threadSearch])

  const selectedThread = threads.find(
    (item) => item.id === selectedThreadId,
  )

  const unreadCount = threads.filter(
    (item) => item.unreadForAdmin,
  ).length

  const khatmaCount = users.filter(
    (item) => item.khatmaDays !== null,
  ).length

  const openThread = (id: string) => {
    setSelectedThreadId(id)
    setTab('messages')
    setMenuOpen(false)
    setDraft('')
  }

  const reply = async (
    event?: FormEvent<HTMLFormElement>,
  ) => {
    event?.preventDefault()

    const text = draft.trim()

    if (
      !user ||
      !selectedThreadId ||
      !text ||
      sendingRef.current
    ) {
      return
    }

    if (text.length > 5000) {
      setMessageError(
        'الرسالة لا يمكن أن تتجاوز 5000 حرف.',
      )
      return
    }

    sendingRef.current = true
    setSending(true)
    setMessageError('')

    try {
      const threadId = selectedThreadId
      await sendSupportMessage(db, {
        threadId, senderId: user.uid, senderName: 'إدارة مصحف سميع', side: 'admin', body: text,
        userName: selectedThread?.userName || 'مستخدم مصحف سميع', userEmail: selectedThread?.userEmail || '',
      })
      if (selectedThreadRef.current === threadId) setDraft((value) => value.trim() === text ? '' : value)
    } catch (error) {
      console.error('Admin send:', error)
      setMessageError(
        supportMessageError(error, true),
      )
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  const logout = async () => {
    setSigningOut(true)

    try {
      await signOut(auth)
      router.replace('/auth')
    } catch (error) {
      console.error('Admin sign out:', error)
      setMessageError(
        'تعذر تسجيل الخروج. حاول مرة أخرى.',
      )
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-[#f4f9fe] text-slate-900"
    >
      {menuOpen && (
        <button
          type="button"
          aria-label="إغلاق القائمة"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-[270px] flex-col bg-[#103d4c] p-5 text-white transition-transform lg:translate-x-0 ${
          menuOpen
            ? 'translate-x-0'
            : 'translate-x-full'
        }`}
      >
        <div className="mb-7 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-[#e9c993]">
              SAMEE3 · إدارة المنصة
            </p>

            <h1 className="mt-1 text-xl font-extrabold">
              مصحف سميع
            </h1>
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            aria-label="إغلاق القائمة"
            className="rounded-xl p-2 text-white/80 lg:hidden"
          >
            <X size={20} />
          </button>
        </div>

        <nav
          aria-label="قائمة الإدارة"
          className="flex-1 space-y-2 overflow-y-auto"
        >
          {MENU.map((item) => {
            const Icon = item.icon

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTab(item.id)
                  setMenuOpen(false)
                }}
                className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-right text-sm font-bold transition ${
                  tab === item.id
                    ? 'bg-white text-[#103d4c]'
                    : 'text-white/75 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon size={19} />
                <span className="flex-1">
                  {item.label}
                </span>

                {item.id === 'messages' &&
                  unreadCount > 0 && (
                    <span className="rounded-full bg-[#d7b576] px-2 py-0.5 text-xs text-[#183949]">
                      {unreadCount}
                    </span>
                  )}
              </button>
            )
          })}
        </nav>

        <div className="space-y-2 border-t border-white/10 pt-4">
          <Link
            href="/"
            className="flex items-center justify-center gap-2 rounded-xl border border-white/15 px-3 py-3 text-sm font-bold text-white/80"
          >
            <ArrowLeft size={16} />
            العودة للتطبيق
          </Link>

          <button
            type="button"
            disabled={signingOut}
            onClick={() => void logout()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-3 py-3 text-sm font-bold disabled:opacity-60"
          >
            {signingOut ? (
              <Loader2
                size={17}
                className="animate-spin"
              />
            ) : (
              <LogOut size={17} />
            )}
            تسجيل الخروج
          </button>
        </div>
      </aside>

      <div className="min-h-screen lg:mr-[270px]">
        <header className="sticky top-0 z-30 flex h-20 items-center justify-between gap-3 border-b border-slate-200 bg-[#f4f9fe]/95 px-4 backdrop-blur sm:px-7">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="فتح القائمة"
              className="rounded-xl border border-slate-200 bg-white p-2.5 lg:hidden"
            >
              <Menu size={21} />
            </button>

            <div>
              <p className="text-xs font-bold text-[#b18c4e]">
                لوحة الإدارة
              </p>

              <h2 className="text-lg font-extrabold">
                {MENU.find(
                  (item) => item.id === tab,
                )?.label}
              </h2>
            </div>
          </div>

          <span className="hidden items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-bold text-[#17607b] sm:flex">
            <ShieldCheck size={16} />
            صلاحيات الإدارة
          </span>
        </header>

        <main className="mx-auto max-w-7xl p-4 sm:p-7">
          {tab === 'dashboard' && (
            <div className="space-y-6">
              <AppStatistics />
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                {[
                  {
                    name: 'المستخدمون',
                    value: usersLoading
                      ? '…'
                      : users.length,
                    icon: Users,
                  },
                  {
                    name: 'خطط الختمة',
                    value: usersLoading
                      ? '…'
                      : khatmaCount,
                    icon: BookOpen,
                  },
                  {
                    name: 'المحادثات',
                    value: threadsLoading
                      ? '…'
                      : threads.length,
                    icon: MessageCircle,
                  },
                  {
                    name: 'تحتاج متابعة',
                    value: threadsLoading
                      ? '…'
                      : unreadCount,
                    icon: Headphones,
                  },
                ].map((stat) => {
                  const Icon = stat.icon

                  return (
                    <div
                      key={stat.name}
                      className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm"
                    >
                      <Icon
                        size={22}
                        className="mb-4 text-[#b68b4a]"
                      />

                      <p className="text-3xl font-extrabold">
                        {stat.value}
                      </p>

                      <p className="mt-2 text-sm text-slate-500">
                        {stat.name}
                      </p>
                    </div>
                  )
                })}
              </div>

              <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-extrabold">
                      أحدث المحادثات
                    </h3>

                    <p className="mt-1 text-xs text-slate-500">
                      بيانات حقيقية من Firestore وليست نشاطات تجريبية
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setTab('messages')}
                    className="text-sm font-bold text-[#17607b]"
                  >
                    عرض الكل
                  </button>
                </div>

                {threadsError && (
                  <p className="mb-3 text-sm text-red-600">
                    {threadsError}
                  </p>
                )}

                {threads.length === 0 ? (
                  <p className="py-7 text-center text-sm text-slate-500">
                    لا توجد محادثات حتى الآن.
                  </p>
                ) : (
                  threads.slice(0, 6).map((thread) => (
                    <button
                      key={thread.id}
                      type="button"
                      onClick={() =>
                        openThread(thread.id)
                      }
                      className="flex w-full items-center justify-between gap-3 border-b border-slate-100 py-4 text-right last:border-0 hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <p className="font-bold">
                          {thread.userName}
                        </p>

                        <p className="mt-1 truncate text-sm text-slate-500">
                          {thread.lastMessage ||
                            'محادثة جديدة'}
                        </p>
                      </div>

                      <div className="shrink-0 text-left text-xs text-slate-400">
                        {thread.unreadForAdmin && (
                          <span className="mb-1 block font-bold text-[#b68b4a]">
                            جديدة
                          </span>
                        )}

                        {formatTime(
                          thread.updatedAt,
                        )}
                      </div>
                    </button>
                  ))
                )}
              </section>
            </div>
          )}

          {tab === 'users' && (
            <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-extrabold">
                    حسابات المستخدمين
                  </h3>

                  <p className="mt-1 text-xs text-slate-500">
                    عرض معلومات الحساب المحفوظة في Firestore
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    void refreshUsers()
                  }
                  disabled={usersLoading}
                  className="flex items-center gap-2 rounded-xl bg-[#115a71] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                >
                  <RefreshCw size={16} />
                  تحديث
                </button>
              </div>

              <div className="relative mb-5">
                <Search
                  className="absolute right-3 top-3 text-slate-400"
                  size={19}
                />

                <input
                  value={searchUsers}
                  onChange={(event) =>
                    setSearchUsers(
                      event.target.value,
                    )
                  }
                  placeholder="ابحث بالاسم أو البريد أو UID"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-3 pr-10 text-sm outline-none focus:border-[#b68b4a]"
                />
              </div>

              {usersError && (
                <p
                  role="alert"
                  className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700"
                >
                  {usersError}
                </p>
              )}

              {usersLoading ? (
                <p className="py-7 text-center text-sm text-slate-500">
                  جارٍ تحميل المستخدمين…
                </p>
              ) : filteredUsers.length === 0 ? (
                <p className="py-7 text-center text-sm text-slate-500">
                  لا يوجد مستخدمون مطابقون.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] text-right text-sm">
                    <thead>
                      <tr className="border-b text-slate-500">
                        <th className="pb-3">
                          المستخدم
                        </th>

                        <th className="pb-3">
                          الحالة
                        </th>

                        <th className="pb-3">
                          تقدم القراءة
                        </th>

                        <th className="pb-3">
                          التفاصيل
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredUsers.map((item) => (
                        <tr
                          key={item.id}
                          className="border-b border-slate-100 last:border-0"
                        >
                          <td className="py-4">
                            <p className="font-bold">
                              {item.name}
                            </p>

                            <p
                              dir="ltr"
                              className="mt-1 text-left text-xs text-slate-500"
                            >
                              {item.email}
                            </p>
                          </td>

                          <td>
                            {item.status}
                          </td>

                          <td>
                            {Math.round(
                              (item.lastReadPage /
                                604) *
                                100,
                            )}
                            %
                          </td>

                          <td>
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedUser(
                                  item,
                                )
                              }
                              className="rounded-xl bg-[#f2f7fa] px-4 py-2 font-bold text-[#17607b]"
                            >
                              عرض البيانات
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {tab === 'messages' && (
            <section className="grid min-h-[610px] overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm lg:grid-cols-[300px_minmax(0,1fr)]">
              <div className="border-b border-slate-100 lg:border-b-0 lg:border-l">
                <div className="p-4">
                  <h3 className="font-extrabold">
                    محادثات المستخدمين
                  </h3>
                  <p role="status" className={`mt-2 text-xs leading-6 ${threadsFromCache ? 'text-amber-700' : 'text-emerald-700'}`}>
                    {threadsLoading ? 'جارٍ الاتصال بصندوق الرسائل…' : threadsError ? 'الاتصال بالصندوق يحتاج مراجعة.' : threadsFromCache ? 'تُعرض نسخة محفوظة؛ بانتظار الخادم.' : 'متصل بصندوق رسائل الإدارة.'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" onClick={() => setInboxRevision((value) => value + 1)} className="rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold">إعادة اتصال</button>
                    <button type="button" disabled={recovering} onClick={() => void recoverMessages()} className="rounded-lg border border-[#ddc99f] px-2 py-2 text-xs font-bold text-[#194f43] disabled:opacity-50">{recovering ? 'جارٍ الاستعادة…' : 'استعادة المحادثات غير الظاهرة'}</button>
                  </div>
                  {recoveryNotice && <p role="status" className="mt-2 text-xs leading-6 text-slate-600">{recoveryNotice}</p>}

                  <div className="relative mt-3">
                    <Search
                      size={17}
                      className="absolute right-3 top-3 text-slate-400"
                    />

                    <input
                      value={threadSearch}
                      onChange={(event) =>
                        setThreadSearch(
                          event.target.value,
                        )
                      }
                      placeholder="ابحث في المحادثات"
                      className="w-full rounded-xl border border-slate-200 py-2.5 pl-3 pr-9 text-sm outline-none"
                    />
                  </div>
                </div>

                <div className="max-h-[400px] overflow-y-auto lg:max-h-[600px]">
                  {threadsError && (
                    <p
                      role="alert"
                      className="p-3 text-sm text-red-600"
                    >
                      {threadsError}
                    </p>
                  )}

                  {threadsLoading ? (
                    <p className="p-5 text-sm text-slate-500">
                      جارٍ تحميل المحادثات…
                    </p>
                  ) : filteredThreads.length ===
                    0 ? (
                    <p className="p-5 text-sm text-slate-500">
                      لا توجد محادثات مطابقة.
                    </p>
                  ) : (
                    filteredThreads.map(
                      (thread) => (
                        <button
                          type="button"
                          key={thread.id}
                          onClick={() =>
                            openThread(
                              thread.id,
                            )
                          }
                          className={`block w-full border-t border-slate-100 p-4 text-right hover:bg-[#f5f9fc] ${
                            thread.id ===
                            selectedThreadId
                              ? 'bg-[#eaf4f8]'
                              : ''
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-bold">
                              {
                                thread.userName
                              }
                            </p>

                            {thread.unreadForAdmin && (
                              <span className="h-2.5 w-2.5 rounded-full bg-[#bb914e]" />
                            )}
                          </div>

                          <p className="mt-1 truncate text-xs text-slate-500">
                            {thread.lastMessage ||
                              'محادثة جديدة'}
                          </p>

                          <p className="mt-1 text-[11px] text-slate-400">
                            {formatTime(
                              thread.updatedAt,
                            )}
                          </p>
                        </button>
                      ),
                    )
                  )}
                </div>
              </div>

              <div className="flex min-h-[560px] min-w-0 flex-col bg-[#f8fafb]">
                {selectedThreadId ? (
                  <>
                    <div className="border-b border-slate-100 bg-white px-5 py-4">
                      <p className="font-extrabold">
                        {selectedThread?.userName ||
                          'مستخدم مصحف سميع'}
                      </p>

                      <p
                        className="mt-1 text-xs text-slate-500"
                        dir="ltr"
                      >
                        {selectedThread?.userEmail ||
                          selectedThreadId}
                      </p>
                    </div>

                    <div
                      className="min-h-[340px] flex-1 space-y-3 overflow-y-auto p-4 sm:p-6"
                      aria-live="polite"
                    >
                      {messagesLoading ? (
                        <p className="text-center text-sm text-slate-500">
                          جارٍ تحميل الرسائل…
                        </p>
                      ) : messages.length === 0 ? (
                        <p className="py-14 text-center text-sm text-slate-500">
                          لا توجد رسائل في هذه المحادثة.
                        </p>
                      ) : (
                        messages.map((message) => {
                          const mine =
                            message.senderId ===
                            user?.uid

                          return (
                            <div
                              key={message.id}
                              className={`flex ${
                                mine
                                  ? 'justify-start'
                                  : 'justify-end'
                              }`}
                            >
                              <div
                                className={`max-w-[88%] rounded-2xl px-4 py-3 shadow-sm sm:max-w-[75%] ${
                                  mine
                                    ? 'rounded-tr-sm bg-[#155a70] text-white'
                                    : 'rounded-tl-sm border border-slate-100 bg-white text-slate-800'
                                }`}
                              >
                                <p className="whitespace-pre-wrap break-words text-sm leading-7">
                                  {message.text}
                                </p>

                                <div
                                  className={`mt-2 flex items-center justify-end gap-1 text-[10px] ${
                                    mine
                                      ? 'text-white/70'
                                      : 'text-slate-400'
                                  }`}
                                >
                                  <span>
                                    {formatTime(
                                      message.createdAt,
                                    )}
                                  </span>

                                  {mine && message.pending && <Loader2 size={13} className="animate-spin" aria-label="بانتظار الخادم" />}
                                  {mine && !message.pending &&
                                    message.read && (
                                      <CheckCheck
                                        size={13}
                                      />
                                    )}
                                </div>
                              </div>
                            </div>
                          )
                        })
                      )}

                      <div ref={bottomRef} />
                    </div>

                    {slowSending && <p role="status" className="mx-4 mb-2 text-xs leading-6 text-amber-800">بانتظار تأكيد حفظ الرد على الخادم؛ لا تعِد إرساله أثناء الانتظار.</p>}
                    {messageError && (
                      <p
                        role="alert"
                        className="mx-4 rounded-xl bg-red-50 p-3 text-sm text-red-700"
                      >
                        {messageError}
                      </p>
                    )}

                    <form
                      onSubmit={(event) =>
                        void reply(event)
                      }
                      className="border-t border-slate-100 bg-white p-3 sm:p-4"
                    >
                      <div className="flex items-end gap-2">
                        <textarea
                          value={draft}
                          onChange={(event) =>
                            setDraft(
                              event.target.value,
                            )
                          }
                          rows={2}
                          maxLength={5000}
                          placeholder="اكتب رد الإدارة…"
                          className="max-h-32 min-h-[50px] flex-1 resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-[#b68b4a]"
                        />

                        <button
                          type="submit"
                          disabled={
                            sending ||
                            !draft.trim()
                          }
                          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#14596e] text-white disabled:opacity-50"
                          aria-label="إرسال الرد"
                        >
                          {sending ? (
                            <Loader2
                              size={20}
                              className="animate-spin"
                            />
                          ) : (
                            <Send size={20} />
                          )}
                        </button>
                      </div>

                      <p className="mt-2 text-xs text-slate-400">
                        رسائل نصية فقط · الحد الأقصى 5000 حرف
                      </p>
                    </form>
                  </>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center gap-3 p-7 text-center">
                    <MessageCircle
                      size={35}
                      className="text-[#c29b60]"
                    />

                    <p className="font-extrabold">
                      اختر محادثة للقراءة والرد
                    </p>

                    <p className="text-sm text-slate-500">
                      تظهر محادثات المستخدمين هنا مباشرة من Firestore
                    </p>
                  </div>
                )}
              </div>
            </section>
          )}

          {tab === 'library' && (
            <IslamicLibraryAdmin />
          )}

          {tab === 'content' && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[
                {
                  title: 'المصحف',
                  href: '/mushaf',
                  icon: BookOpen,
                },
                {
                  title: 'المكتبة الصوتية',
                  href: '/audio',
                  icon: Headphones,
                },
                {
                  title: 'الأحاديث',
                  href: '/hadith',
                  icon: BookOpen,
                },
                {
                  title: 'الأذكار',
                  href: '/adhkar',
                  icon: Activity,
                },
                {
                  title: 'صفحة التنزيلات',
                  href: '/offline',
                  icon: RefreshCw,
                },
              ].map((item) => {
                const Icon = item.icon

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-5 font-bold shadow-sm hover:border-[#c5a16a]"
                  >
                    <Icon
                      size={20}
                      className="text-[#17607b]"
                    />

                    {item.title}

                    <ArrowLeft
                      size={15}
                      className="mr-auto"
                    />
                  </Link>
                )
              })}

              <div className="rounded-2xl border border-[#e5d6bd] bg-[#fffbf5] p-5 text-sm leading-7 text-[#856b3c]">
                هذه روابط لفتح الأقسام ومراجعتها،
                وليست أدوات لتعديل محتواها.
                إدارة الكتب متاحة من تبويب
                المكتبة الشرعية.
              </div>
            </div>
          )}
        </main>
      </div>

      {selectedUser && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4"
          onClick={() =>
            setSelectedUser(null)
          }
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="بيانات حساب المستخدم"
            className="max-h-[85vh] w-full max-w-xl overflow-hidden rounded-3xl bg-white shadow-2xl"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="flex items-center justify-between bg-[#103d4c] px-5 py-5 text-white">
              <div>
                <p className="text-xs text-[#ebca94]">
                  تفاصيل الحساب
                </p>

                <h3 className="mt-1 font-extrabold">
                  {selectedUser.name}
                </h3>
              </div>

              <button
                type="button"
                onClick={() =>
                  setSelectedUser(null)
                }
                aria-label="إغلاق"
                className="rounded-xl p-2 hover:bg-white/10"
              >
                <X size={20} />
              </button>
            </div>

            <div className="max-h-[60vh] space-y-2 overflow-y-auto p-5">
              <p className="break-all text-xs text-slate-500">
                UID: {selectedUser.id}
              </p>

              {Object.entries(
                selectedUser.fields,
              ).map(([key, value]) => (
                <div
                  key={key}
                  className="rounded-xl bg-slate-50 px-4 py-3"
                >
                  <p
                    className="text-[11px] font-semibold text-slate-500"
                    dir="ltr"
                  >
                    {key}
                  </p>

                  <p className="mt-1 break-all text-sm font-bold text-slate-800">
                    {displayValue(value)}
                  </p>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 border-t p-4">
              <button
                type="button"
                onClick={() => {
                  setSelectedUser(null)
                  openThread(
                    selectedUser.id,
                  )
                }}
                className="rounded-xl bg-[#14596e] px-4 py-2.5 text-sm font-bold text-white"
              >
                عرض المحادثة
              </button>

              <button
                type="button"
                onClick={() =>
                  setSelectedUser(null)
                }
                className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-bold"
              >
                إغلاق
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

export default function AdminPage() {
  return (
    <AdminGate>
      <AdminDashboard />
    </AdminGate>
  )
}
