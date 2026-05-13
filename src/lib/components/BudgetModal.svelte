<script lang="ts">
    import { createEventDispatcher, onMount, onDestroy, tick } from 'svelte'
    import { fly } from 'svelte/transition'
    import { session } from '$lib/auth.js'

    export let isOpen = false

    const dispatch = createEventDispatcher()

    type Tab = 'overview' | 'reports' | 'categories' | 'scenario'
    let activeTab: Tab = 'overview'

    // Accounts state
    interface Account {
        id: string
        teller_account_id: string
        name: string
        institution: string
        type: string | null
        subtype: string | null
        currency: string
        last_four: string | null
        status: string
        balance_available: string | null
        balance_ledger: string | null
    }

    // Transactions state
    interface Transaction {
        id: string
        teller_account_id: string
        teller_transaction_id: string
        posted_at: string | null
        authorized_at: string | null
        pending: boolean
        amount: number
        currency: string
        description: string
        merchant: string | null
        category_auto: string | null
        category_id: string | null
        category_name: string | null
        category_stream: string | null
    }

    // Categories state
    interface Category {
        id: string
        name: string
        sort_order: number
        stream: string | null
    }

    const DEFAULT_STREAMS = ['Shared mission', 'Personal mission', 'Renewal', 'Drift']

    let accounts: Account[] = []
    let transactions: Transaction[] = []
    let categories: Category[] = []
    let txCounts: Record<string, number> = {}
    let loadingAccounts = false
    let loadingTransactions = false
    let loadingCategories = false
    let linking = false
    let syncing = false
    let error = ''

    // Transaction filters
    let filterAccountId = ''
    let filterCategory = ''
    let filterDateFrom = ''
    let filterDateTo = ''

    function setDatePreset(preset: 'thisMonth' | 'lastMonth' | 'last90' | 'ytd' | 'all') {
        const now = new Date()
        const pad = (n: number) => String(n).padStart(2, '0')
        const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
        if (preset === 'thisMonth') {
            filterDateFrom = fmt(new Date(now.getFullYear(), now.getMonth(), 1))
            filterDateTo = fmt(now)
        } else if (preset === 'lastMonth') {
            const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
            const last = new Date(now.getFullYear(), now.getMonth(), 0)
            filterDateFrom = fmt(first)
            filterDateTo = fmt(last)
        } else if (preset === 'last90') {
            const from = new Date(now)
            from.setDate(from.getDate() - 90)
            filterDateFrom = fmt(from)
            filterDateTo = fmt(now)
        } else if (preset === 'ytd') {
            filterDateFrom = `${now.getFullYear()}-01-01`
            filterDateTo = fmt(now)
        } else {
            filterDateFrom = ''
            filterDateTo = ''
        }
    }

    function getAuthHeaders(): Record<string, string> {
        let s: any = null
        session.subscribe(v => s = v)()
        return s?.access_token
            ? { Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' }
            : { 'Content-Type': 'application/json' }
    }

    $: if (isOpen) {
        loadAccounts()
        loadCategories()
    }

    $: if (isOpen && activeTab === 'overview' && accounts.length > 0) {
        loadTransactions()
    }

    type SortCol = 'date' | 'description' | 'category' | 'amount'
    let sortCol: SortCol = 'date'
    let sortAsc = false

    function setSort(col: SortCol) {
        if (sortCol === col) {
            sortAsc = !sortAsc
        } else {
            sortCol = col
            sortAsc = col !== 'date'
        }
    }

    $: filteredTransactions = (() => {
        const filtered = transactions.filter(t => {
            if (filterAccountId && t.teller_account_id !== filterAccountId) return false
            const cat = t.category_name || t.category_auto || ''
            if (filterCategory && cat !== filterCategory) return false
            const txDate = (t.posted_at || t.authorized_at || '').slice(0, 10)
            if (filterDateFrom && txDate < filterDateFrom) return false
            if (filterDateTo && txDate > filterDateTo) return false
            return true
        })
        filtered.sort((a, b) => {
            let cmp = 0
            if (sortCol === 'date') {
                const da = a.posted_at || a.authorized_at || ''
                const db = b.posted_at || b.authorized_at || ''
                cmp = da < db ? -1 : da > db ? 1 : 0
            } else if (sortCol === 'description') {
                cmp = a.description.localeCompare(b.description)
            } else if (sortCol === 'category') {
                const ca = a.category_name || a.category_auto || ''
                const cb = b.category_name || b.category_auto || ''
                cmp = ca.localeCompare(cb)
            } else if (sortCol === 'amount') {
                cmp = a.amount - b.amount
            }
            return sortAsc ? cmp : -cmp
        })
        return filtered
    })()

    async function loadAccounts() {
        loadingAccounts = true
        error = ''
        try {
            const res = await fetch('/api/teller/accounts', { headers: getAuthHeaders() })
            if (res.ok) {
                const data = await res.json()
                accounts = data.accounts || []
            } else {
                const data = await res.json()
                error = data.error || 'Failed to load accounts'
            }
        } catch (e) {
            error = 'Failed to load accounts'
        }
        loadingAccounts = false
    }

    async function loadTransactions() {
        loadingTransactions = true
        try {
            const params = new URLSearchParams()
            if (filterAccountId) params.set('accountId', filterAccountId)
            const res = await fetch(`/api/teller/transactions?${params}`, { headers: getAuthHeaders() })
            if (res.ok) {
                const data = await res.json()
                transactions = data.transactions || []
            }
        } catch (e) {
            console.error('Failed to load transactions', e)
        }
        loadingTransactions = false
    }

    async function loadCategories() {
        loadingCategories = true
        try {
            const res = await fetch('/api/teller/categories', { headers: getAuthHeaders() })
            if (res.ok) {
                const data = await res.json()
                categories = data.categories || []
                txCounts = data.txCounts || {}
            }
        } catch (e) {
            console.error('Failed to load categories', e)
        }
        loadingCategories = false
    }

    // ── Teller Connect flow ──
    let tellerConnect: any = null
    let tellerScriptLoaded = false

    function ensureTellerScript(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (tellerScriptLoaded && (window as any).TellerConnect) {
                resolve()
                return
            }
            // Check if script already exists
            if (document.querySelector('script[src*="teller.io/connect"]')) {
                const check = setInterval(() => {
                    if ((window as any).TellerConnect) {
                        tellerScriptLoaded = true
                        clearInterval(check)
                        resolve()
                    }
                }, 100)
                return
            }
            const script = document.createElement('script')
            script.src = 'https://cdn.teller.io/connect/connect.js'
            script.onload = () => {
                tellerScriptLoaded = true
                resolve()
            }
            script.onerror = () => reject(new Error('Failed to load Teller Connect'))
            document.body.appendChild(script)
        })
    }

    async function startLinkFlow() {
        linking = true
        error = ''
        try {
            // Step 1: Get application ID and optional nonce from server
            const res = await fetch('/api/teller/connect/start', {
                method: 'POST',
                headers: getAuthHeaders()
            })
            if (!res.ok) {
                const data = await res.json()
                error = data.error || 'Failed to start linking'
                linking = false
                return
            }
            const { applicationId, environment } = await res.json()

            // Step 2: Load Teller Connect script and open
            await ensureTellerScript()

            tellerConnect = (window as any).TellerConnect.setup({
                applicationId,
                environment: environment || 'sandbox',
                products: ['transactions'],
                onSuccess: async (enrollment: any) => {
                    // Step 3: Send enrollment to server to securely store the access token
                    try {
                        const saveRes = await fetch('/api/teller/connect/complete', {
                            method: 'POST',
                            headers: getAuthHeaders(),
                            body: JSON.stringify({
                                accessToken: enrollment.accessToken,
                                enrollmentId: enrollment.enrollment?.id,
                                institutionName: enrollment.enrollment?.institution?.name
                            })
                        })
                        if (saveRes.ok) {
                            // Step 4: Trigger initial sync
                            await syncAccounts()
                            await loadAccounts()
                        } else {
                            const data = await saveRes.json()
                            error = data.error || 'Failed to save enrollment'
                        }
                    } catch (e) {
                        error = 'Failed to save enrollment'
                    }
                    linking = false
                },
                onExit: () => {
                    linking = false
                }
            })
            tellerConnect.open()
        } catch (e: any) {
            error = e.message || 'Failed to start link flow'
            linking = false
        }
    }

    async function syncAccounts() {
        syncing = true
        error = ''
        try {
            const res = await fetch('/api/teller/sync', {
                method: 'POST',
                headers: getAuthHeaders()
            })
            if (res.ok) {
                await loadAccounts()
                if (activeTab === 'transactions') {
                    await loadTransactions()
                }
            } else {
                const data = await res.json()
                error = data.error || 'Sync failed'
            }
        } catch (e) {
            error = 'Sync failed'
        }
        syncing = false
    }

    async function updateTransactionCategory(transactionId: string, categoryId: string | null) {
        try {
            const res = await fetch('/api/teller/transactions', {
                method: 'PATCH',
                headers: getAuthHeaders(),
                body: JSON.stringify({ transactionId, categoryId })
            })
            if (res.ok) {
                const category = categories.find(c => c.id === categoryId)
                transactions = transactions.map(t =>
                    t.id === transactionId
                        ? {
                            ...t,
                            category_id: categoryId,
                            category_name: category?.name || null,
                            category_stream: category?.stream || null
                        }
                        : t
                )
            }
        } catch (e) {
            console.error('Failed to update category', e)
        }
    }

    function formatAmount(amount: number, currency: string): string {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency || 'USD'
        }).format(Math.abs(amount))
    }

    function formatDate(dateStr: string | null): string {
        if (!dateStr) return '—'
        const d = new Date(dateStr + 'T00:00:00')
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    }

    function closeModal() {
        isOpen = false
        dispatch('close')
    }

    function handleBackdropClick(e: MouseEvent) {
        if (e.target === e.currentTarget) closeModal()
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Escape') closeModal()
    }

    // ── Reports state ──
    interface ReportData {
        months: string[]
        groups: string[]
        data: Record<string, Record<string, number>>
        totals: Record<string, number>
        monthlyTotals: Record<string, number>
    }
    type GroupBy = 'stream' | 'category'
    let reportGroupBy: GroupBy = 'stream'
    let reportDateFrom = ''
    let reportDateTo = ''
    let reportData: ReportData | null = null
    let loadingReport = false

    // Bubble matrix tooltip
    interface BubbleTip { x: number; y: number; group: string; month: string; amount: number }
    let bubbleTip: BubbleTip | null = null

    const CHART_COLORS = [
        '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
        '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#6366f1',
        '#14b8a6', '#a855f7'
    ]

    // SVG bubble matrix layout constants
    const BM_PAD_LEFT = 140
    const BM_PAD_TOP = 28
    const BM_PAD_BOTTOM = 36
    const BM_PAD_RIGHT = 24
    const BM_ROW_H = 52
    const BM_COL_W = 72
    const BM_MAX_R = 22

    $: bmSvgW = BM_PAD_LEFT + (reportData?.months.length || 0) * BM_COL_W + BM_PAD_RIGHT
    $: bmSvgH = BM_PAD_TOP + (reportData?.groups.length || 0) * BM_ROW_H + BM_PAD_BOTTOM
    $: bmMaxVal = reportData
        ? Math.max(...reportData.groups.flatMap(g => reportData!.months.map(m => reportData!.data[g]?.[m] || 0)))
        : 1

    function setReportPreset(preset: 'thisMonth' | 'lastMonth' | 'last90' | 'ytd' | 'last12') {
        const now = new Date()
        const pad = (n: number) => String(n).padStart(2, '0')
        const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
        if (preset === 'thisMonth') {
            reportDateFrom = fmt(new Date(now.getFullYear(), now.getMonth(), 1))
            reportDateTo = fmt(now)
        } else if (preset === 'lastMonth') {
            reportDateFrom = fmt(new Date(now.getFullYear(), now.getMonth() - 1, 1))
            reportDateTo = fmt(new Date(now.getFullYear(), now.getMonth(), 0))
        } else if (preset === 'last90') {
            const from = new Date(now); from.setDate(from.getDate() - 90)
            reportDateFrom = fmt(from); reportDateTo = fmt(now)
        } else if (preset === 'ytd') {
            reportDateFrom = `${now.getFullYear()}-01-01`; reportDateTo = fmt(now)
        } else if (preset === 'last12') {
            const from = new Date(now); from.setMonth(from.getMonth() - 12)
            reportDateFrom = fmt(from); reportDateTo = fmt(now)
        }
    }

    async function loadReport() {
        loadingReport = true
        try {
            const params = new URLSearchParams({ groupBy: reportGroupBy })
            if (reportDateFrom) params.set('from', reportDateFrom)
            if (reportDateTo) params.set('to', reportDateTo)
            const res = await fetch(`/api/teller/reports?${params}`, { headers: getAuthHeaders() })
            if (res.ok) {
                reportData = await res.json()
                bubbleTip = null
            }
        } catch (e) {
            console.error('Failed to load report', e)
        }
        loadingReport = false
    }

    function formatMonth(ym: string) {
        const [y, m] = ym.split('-')
        return new Date(Number(y), Number(m) - 1).toLocaleString('default', { month: 'short', year: '2-digit' })
    }

    function bmRadius(amount: number): number {
        if (!bmMaxVal || amount <= 0) return 0
        return Math.sqrt(amount / bmMaxVal) * BM_MAX_R
    }

    $: if (isOpen && activeTab === 'reports') {
        if (!reportData) {
            setReportPreset('last12')
            loadReport()
        }
    }

    // Unique categories from transactions + user categories for dropdown
    $: allCategories = Array.from(new Set([
        ...categories.map(c => c.name),
        ...transactions.map(t => t.category_auto).filter(Boolean),
        ...transactions.map(t => t.category_name).filter(Boolean)
    ])) as string[]

    // Editing category inline
    let editingTxId: string | null = null
    let editCategoryId = ''

    function startEditCategory(tx: Transaction) {
        editingTxId = tx.id
        editCategoryId = tx.category_id || ''
    }

    function saveCategory(txId: string) {
        updateTransactionCategory(txId, editCategoryId || null)
        editingTxId = null
        editCategoryId = ''
    }

    function cancelEditCategory() {
        editingTxId = null
        editCategoryId = ''
    }

    // ── Category management state ──
    let renamingCatId: string | null = null
    let renameCatValue = ''
    let deletingCategory: Category | null = null
    let reassignCategoryId = ''
    let savingCategory = false

    function startRenameCategory(cat: Category) {
        renamingCatId = cat.id
        renameCatValue = cat.name
    }

    async function saveRenameCategory(cat: Category) {
        if (!renameCatValue.trim() || renameCatValue.trim() === cat.name) {
            renamingCatId = null
            return
        }
        savingCategory = true
        try {
            const res = await fetch('/api/teller/categories', {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({ id: cat.id, name: renameCatValue.trim() })
            })
            if (res.ok) {
                await loadCategories()
            } else {
                const data = await res.json()
                error = data.error || 'Failed to rename category'
            }
        } catch (e) {
            error = 'Failed to rename category'
        }
        savingCategory = false
        renamingCatId = null
    }

    function cancelRenameCategory() {
        renamingCatId = null
        renameCatValue = ''
    }

    async function updateCategoryStream(cat: Category, stream: string) {
        try {
            const res = await fetch('/api/teller/categories', {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({ id: cat.id, stream })
            })
            if (res.ok) {
                categories = categories.map(c =>
                    c.id === cat.id ? { ...c, stream } : c
                )
            } else {
                const data = await res.json()
                error = data.error || 'Failed to update stream'
            }
        } catch (e) {
            error = 'Failed to update stream'
        }
    }

    function promptDeleteCategory(cat: Category) {
        deletingCategory = cat
        reassignCategoryId = ''
    }

    async function confirmDeleteCategory() {
        if (!deletingCategory) return
        const catTxCount = txCounts[deletingCategory.id] || 0

        savingCategory = true
        try {
            const body: any = { id: deletingCategory.id }
            if (catTxCount > 0 && reassignCategoryId) {
                body.reassignToCategoryId = reassignCategoryId
            }

            const res = await fetch('/api/teller/categories', {
                method: 'DELETE',
                headers: getAuthHeaders(),
                body: JSON.stringify(body)
            })

            if (res.ok) {
                deletingCategory = null
                reassignCategoryId = ''
                await loadCategories()
            } else {
                const data = await res.json()
                error = data.error || 'Failed to delete category'
            }
        } catch (e) {
            error = 'Failed to delete category'
        }
        savingCategory = false
    }

    function cancelDeleteCategory() {
        deletingCategory = null
        reassignCategoryId = ''
    }

    // ── Add new category ──
    let addingCategory = false
    let newCategoryName = ''

    function startAddCategory() {
        addingCategory = true
        newCategoryName = ''
    }

    async function saveNewCategory() {
        if (!newCategoryName.trim()) {
            addingCategory = false
            return
        }
        savingCategory = true
        try {
            const res = await fetch('/api/teller/categories', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ name: newCategoryName.trim() })
            })
            if (res.ok) {
                addingCategory = false
                newCategoryName = ''
                await loadCategories()
            } else {
                const data = await res.json()
                error = data.error || 'Failed to create category'
            }
        } catch (e) {
            error = 'Failed to create category'
        }
        savingCategory = false
    }

    function cancelAddCategory() {
        addingCategory = false
        newCategoryName = ''
    }

    // Unique streams used across categories
    $: usedStreams = Array.from(new Set([
        ...DEFAULT_STREAMS,
        ...categories.map(c => c.stream).filter(Boolean)
    ])) as string[]

    // ── Scenario Explorer ──
    interface ScenarioAdjustment {
        id: string
        label: string
        amount: number
        direction: 'income' | 'expense'
        startMonth: string      // 'YYYY-MM'
        type: 'one-time' | 'recurring'
    }
    interface Scenario {
        monthlyIncome: number
        monthlyExpenses: number
        adjustments: ScenarioAdjustment[]
    }

    const SCENARIO_KEY = 'lisocal_scenario'
    const SCENARIO_MONTHS = 24

    function defaultScenario(): Scenario {
        return { monthlyIncome: 0, monthlyExpenses: 0, adjustments: [] }
    }

    function loadScenario(): Scenario {
        if (typeof window === 'undefined') return defaultScenario()
        try {
            const raw = localStorage.getItem(SCENARIO_KEY)
            return raw ? JSON.parse(raw) : defaultScenario()
        } catch { return defaultScenario() }
    }

    function saveScenario(s: Scenario) {
        if (typeof window === 'undefined') return
        localStorage.setItem(SCENARIO_KEY, JSON.stringify(s))
    }

    let scenario: Scenario = defaultScenario()
    let scenarioLoaded = false

    $: if (isOpen && activeTab === 'scenario' && !scenarioLoaded) {
        scenario = loadScenario()
        scenarioLoaded = true
    }

    $: if (scenarioLoaded) saveScenario(scenario)

    // Seed balance: sum of balance_ledger (or balance_available) across all accounts
    $: scenarioSeed = accounts.reduce((sum, a) => {
        const bal = parseFloat(a.balance_ledger ?? a.balance_available ?? '0')
        return sum + (isNaN(bal) ? 0 : bal)
    }, 0)

    // Generate 24-month projection rows
    $: scenarioRows = (() => {
        const rows: { month: string; label: string; income: number; expenses: number; net: number; balance: number; adjs: ScenarioAdjustment[] }[] = []
        const now = new Date()
        let balance = scenarioSeed
        for (let i = 0; i < SCENARIO_MONTHS; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
            const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
            const label = d.toLocaleString('default', { month: 'short', year: '2-digit' })

            // Find applicable adjustments
            const adjs = scenario.adjustments.filter(a => {
                if (a.type === 'one-time') return a.startMonth === ym
                return a.startMonth <= ym
            })

            let income = scenario.monthlyIncome
            let expenses = scenario.monthlyExpenses
            adjs.forEach(a => {
                if (a.direction === 'income') income += a.amount
                else expenses += a.amount
            })

            const net = income - expenses
            balance = balance + net
            rows.push({ month: ym, label, income, expenses, net, balance, adjs })
        }
        return rows
    })()

    // SVG chart constants
    const SC_PAD_L = 64
    const SC_PAD_R = 24
    const SC_PAD_T = 24
    const SC_PAD_B = 36
    const SC_H = 240

    let scenarioSvgW = 600 // updated reactively after mount
    let scenarioChartEl: HTMLDivElement | null = null

    $: scMinBal = Math.min(0, ...scenarioRows.map(r => r.balance))
    $: scMaxBal = Math.max(scenarioSeed, ...scenarioRows.map(r => r.balance))
    $: scRange = scMaxBal - scMinBal || 1

    function scX(i: number, w: number) {
        const innerW = w - SC_PAD_L - SC_PAD_R
        return SC_PAD_L + (i / (SCENARIO_MONTHS - 1)) * innerW
    }
    function scY(bal: number) {
        return SC_PAD_T + (1 - (bal - scMinBal) / scRange) * (SC_H - SC_PAD_T - SC_PAD_B)
    }
    function scZeroY() {
        return scY(0)
    }

    $: scenarioPath = (() => {
        const w = scenarioSvgW
        return scenarioRows.map((r, i) => `${i === 0 ? 'M' : 'L'}${scX(i, w).toFixed(1)},${scY(r.balance).toFixed(1)}`).join(' ')
    })()

    $: scenarioNegPath = (() => {
        const w = scenarioSvgW
        if (scMinBal >= 0) return ''
        const zy = scY(0)
        const pts = scenarioRows.map((r, i) => `${scX(i, w).toFixed(1)},${scY(r.balance).toFixed(1)}`).join(' ')
        const first = `${scX(0, w).toFixed(1)},${zy}`
        const last = `${scX(SCENARIO_MONTHS - 1, w).toFixed(1)},${zy}`
        return `M${first} L${pts} L${last} Z`
    })()

    // Y-axis ticks (4 ticks)
    $: scYTicks = (() => {
        const ticks = []
        for (let i = 0; i <= 3; i++) {
            const val = scMinBal + (scRange * i) / 3
            ticks.push(val)
        }
        return ticks
    })()

    function fmtBalance(n: number) {
        const abs = Math.abs(n)
        if (abs >= 1_000_000) return `${n < 0 ? '-' : ''}$${(abs / 1_000_000).toFixed(1)}M`
        if (abs >= 1_000) return `${n < 0 ? '-' : ''}$${(abs / 1_000).toFixed(0)}k`
        return `${n < 0 ? '-' : ''}$${abs.toFixed(0)}`
    }

    // Hover tooltip for chart
    interface ScTip { x: number; y: number; row: typeof scenarioRows[0] }
    let scTip: ScTip | null = null

    function scHandleMousemove(e: MouseEvent) {
        const svgEl = (e.currentTarget as SVGSVGElement)
        const rect = svgEl.getBoundingClientRect()
        const mx = e.clientX - rect.left
        const innerW = scenarioSvgW - SC_PAD_L - SC_PAD_R
        const idx = Math.round(((mx - SC_PAD_L) / innerW) * (SCENARIO_MONTHS - 1))
        const clamped = Math.max(0, Math.min(SCENARIO_MONTHS - 1, idx))
        const row = scenarioRows[clamped]
        if (row) {
            const cx = scX(clamped, scenarioSvgW)
            const cy = scY(row.balance)
            scTip = { x: cx, y: cy, row }
        }
    }

    // Adjustment add-form state
    let scShowAddForm = false
    let scNewLabel = ''
    let scNewAmount = ''
    let scNewDirection: 'income' | 'expense' = 'expense'
    let scNewStartMonth = ''
    let scNewType: 'one-time' | 'recurring' = 'recurring'

    function scOpenAddForm() {
        const now = new Date()
        scNewStartMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        scNewLabel = ''
        scNewAmount = ''
        scNewDirection = 'expense'
        scNewType = 'recurring'
        scShowAddForm = true
    }

    function scSaveAdj() {
        const amt = parseFloat(scNewAmount)
        if (!scNewLabel.trim() || isNaN(amt) || amt <= 0 || !scNewStartMonth) return
        const adj: ScenarioAdjustment = {
            id: crypto.randomUUID(),
            label: scNewLabel.trim(),
            amount: amt,
            direction: scNewDirection,
            startMonth: scNewStartMonth,
            type: scNewType
        }
        scenario = { ...scenario, adjustments: [...scenario.adjustments, adj] }
        scShowAddForm = false
    }

    function scRemoveAdj(id: string) {
        scenario = { ...scenario, adjustments: scenario.adjustments.filter(a => a.id !== id) }
    }

    function scFormatMonth(ym: string) {
        const [y, m] = ym.split('-')
        return new Date(Number(y), Number(m) - 1).toLocaleString('default', { month: 'short', year: 'numeric' })
    }

    $: scenarioNegMonth = scenarioRows.find(r => r.balance < 0)
</script>

{#if isOpen}
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div class="budget-backdrop" on:click={handleBackdropClick} on:keydown={handleKeydown} role="presentation">
        <div class="budget-modal" role="dialog" aria-labelledby="budget-title" aria-modal="true">
            <div class="budget-header">
                <h2 id="budget-title">BUDGET</h2>
                <div class="header-actions">
                    {#if accounts.length > 0}
                        <button class="sync-button" on:click={syncAccounts} disabled={syncing} title="Sync accounts">
                            <span class="material-symbols-outlined" class:spinning={syncing}>sync</span>
                        </button>
                    {/if}
                    <button class="close-button" on:click={closeModal} aria-label="Close budget">×</button>
                </div>
            </div>

            <div class="budget-tabs">
                <button
                    class="tab-button"
                    class:active={activeTab === 'overview'}
                    on:click={() => activeTab = 'overview'}
                >Overview</button>
                <button
                    class="tab-button"
                    class:active={activeTab === 'reports'}
                    on:click={() => activeTab = 'reports'}
                >Reports</button>
                <button
                    class="tab-button"
                    class:active={activeTab === 'categories'}
                    on:click={() => activeTab = 'categories'}
                >Categories</button>
                <button
                    class="tab-button"
                    class:active={activeTab === 'scenario'}
                    on:click={() => activeTab = 'scenario'}
                >Scenario</button>
            </div>

            <div class="budget-content">
                {#if error}
                    <div class="error-banner">{error}
                        <button class="dismiss-error" on:click={() => error = ''}>×</button>
                    </div>
                {/if}

                <!-- ─── Overview Tab (accounts sidebar + transactions) ─── -->
                {#if activeTab === 'overview'}
                    <div class="tab-panel overview-panel" transition:fly={{ duration: 200, x: -20 }}>
                        {#if loadingAccounts}
                            <div class="loading-state">Loading accounts...</div>
                        {:else if accounts.length === 0}
                            <div class="empty-state">
                                <span class="material-symbols-outlined empty-icon">account_balance</span>
                                <h3>No accounts linked</h3>
                                <p>Connect your bank account to start tracking transactions and budgeting.</p>
                                <button class="link-button" on:click={startLinkFlow} disabled={linking}>
                                    {#if linking}
                                        Connecting...
                                    {:else}
                                        <span class="material-symbols-outlined">add_link</span>
                                        Link Account
                                    {/if}
                                </button>
                            </div>
                        {:else}
                            <div class="split-panel">
                                <!-- Accounts sidebar -->
                                <div class="accounts-sidebar">
                                    <button
                                        class="sidebar-acct-item"
                                        class:active={filterAccountId === ''}
                                        on:click={() => { filterAccountId = ''; loadTransactions() }}
                                    >
                                        <span class="material-symbols-outlined sidebar-acct-icon">account_balance</span>
                                        <div class="sidebar-acct-info">
                                            <div class="sidebar-acct-name">All accounts</div>
                                        </div>
                                    </button>
                                    {#each accounts as account (account.id)}
                                        <button
                                            class="sidebar-acct-item"
                                            class:active={filterAccountId === account.teller_account_id}
                                            on:click={() => { filterAccountId = account.teller_account_id; loadTransactions() }}
                                        >
                                            <span class="material-symbols-outlined sidebar-acct-icon">
                                                {account.type === 'credit' ? 'credit_card' : 'savings'}
                                            </span>
                                            <div class="sidebar-acct-info">
                                                <div class="sidebar-acct-name">{account.name}</div>
                                                {#if account.last_four}
                                                    <div class="sidebar-acct-meta">···{account.last_four}</div>
                                                {/if}
                                            </div>
                                            {#if account.balance_available !== null || account.balance_ledger !== null}
                                                {@const raw = account.balance_available ?? account.balance_ledger}
                                                <div class="sidebar-acct-balance">
                                                    {parseFloat(raw) < 0 ? '-' : ''}{account.currency === 'USD' ? '$' : account.currency}{Math.abs(parseFloat(raw)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </div>
                                            {/if}
                                        </button>
                                    {/each}
                                    <div class="sidebar-footer">
                                        <button class="link-button" on:click={startLinkFlow} disabled={linking}>
                                            <span class="material-symbols-outlined">add_link</span>
                                            Link account
                                        </button>
                                    </div>
                                </div>

                                <!-- Transactions main -->
                                <div class="transactions-main">
                                    <div class="transaction-filters">
                                        <div class="filter-row">
                                            <select bind:value={filterCategory} class="filter-select">
                                                <option value="">All categories</option>
                                                {#each allCategories as cat}
                                                    <option value={cat}>{cat}</option>
                                                {/each}
                                            </select>
                                            <input type="date" class="filter-select date-input" bind:value={filterDateFrom} title="From date" />
                                            <span class="date-sep">–</span>
                                            <input type="date" class="filter-select date-input" bind:value={filterDateTo} title="To date" />
                                        </div>
                                        <div class="filter-presets">
                                            <button class="preset-btn" on:click={() => setDatePreset('thisMonth')}>This month</button>
                                            <button class="preset-btn" on:click={() => setDatePreset('lastMonth')}>Last month</button>
                                            <button class="preset-btn" on:click={() => setDatePreset('last90')}>Last 90 days</button>
                                            <button class="preset-btn" on:click={() => setDatePreset('ytd')}>Year to date</button>
                                            <button class="preset-btn" on:click={() => setDatePreset('all')}>All</button>
                                        </div>
                                    </div>

                                    {#if loadingTransactions}
                                        <div class="loading-state">Loading transactions...</div>
                                    {:else if filteredTransactions.length === 0}
                                        <div class="empty-state small">
                                            <p>No transactions found. Try syncing or adjusting your filters.</p>
                                        </div>
                                    {:else}
                                        <div class="transactions-table-wrapper">
                                            <table class="transactions-table">
                                                <thead>
                                                    <tr>
                                                        <th class="sortable" on:click={() => setSort('date')}>
                                                            Date{sortCol === 'date' ? (sortAsc ? ' ↑' : ' ↓') : ''}
                                                        </th>
                                                        <th class="sortable" on:click={() => setSort('description')}>
                                                            Description{sortCol === 'description' ? (sortAsc ? ' ↑' : ' ↓') : ''}
                                                        </th>
                                                        <th class="sortable" on:click={() => setSort('category')}>
                                                            Category{sortCol === 'category' ? (sortAsc ? ' ↑' : ' ↓') : ''}
                                                        </th>
                                                        <th class="amount-col sortable" on:click={() => setSort('amount')}>
                                                            Amount{sortCol === 'amount' ? (sortAsc ? ' ↑' : ' ↓') : ''}
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {#each filteredTransactions as tx (tx.id)}
                                                        <tr class:pending={tx.pending}>
                                                            <td class="date-cell">
                                                                {formatDate(tx.posted_at || tx.authorized_at)}
                                                                {#if tx.pending}
                                                                    <span class="pending-badge">pending</span>
                                                                {/if}
                                                            </td>
                                                            <td class="desc-cell">
                                                                <div class="tx-description">{tx.description}</div>
                                                                {#if tx.merchant}
                                                                    <div class="tx-merchant">{tx.merchant}</div>
                                                                {/if}
                                                            </td>
                                                            <td class="category-cell">
                                                                {#if editingTxId === tx.id}
                                                                    <div class="category-edit">
                                                                        <select
                                                                            class="category-input"
                                                                            bind:value={editCategoryId}
                                                                            on:keydown={(e) => {
                                                                                if (e.key === 'Enter') saveCategory(tx.id)
                                                                                if (e.key === 'Escape') cancelEditCategory()
                                                                            }}
                                                                        >
                                                                            <option value="">Unassigned</option>
                                                                            {#each categories as cat}
                                                                                <option value={cat.id}>{cat.name}</option>
                                                                            {/each}
                                                                        </select>
                                                                        <button class="btn-tiny" on:click={() => saveCategory(tx.id)}>✓</button>
                                                                        <button class="btn-tiny" on:click={cancelEditCategory}>✕</button>
                                                                    </div>
                                                                {:else}
                                                                    <button
                                                                        class="category-label"
                                                                        on:click={() => startEditCategory(tx)}
                                                                        title="Click to change category"
                                                                    >
                                                                        {tx.category_name || tx.category_auto || '—'}
                                                                    </button>
                                                                {/if}
                                                            </td>
                                                            <td class="amount-cell" class:negative={tx.amount < 0}>
                                                                {tx.amount < 0 ? '-' : ''}{formatAmount(tx.amount, tx.currency)}
                                                            </td>
                                                        </tr>
                                                    {/each}
                                                </tbody>
                                            </table>
                                        </div>
                                    {/if}
                                </div>
                            </div>
                        {/if}
                    </div>

                <!-- ─── Reports Tab ─── -->
                {:else if activeTab === 'reports'}
                    <div class="tab-panel" transition:fly={{ duration: 200, x: -20 }}>
                        <div class="report-controls">
                            <div class="report-top-row">
                                <div class="report-group-toggle">
                                    <button
                                        class="group-toggle-btn"
                                        class:active={reportGroupBy === 'stream'}
                                        on:click={() => { reportGroupBy = 'stream'; loadReport() }}
                                    >By stream</button>
                                    <button
                                        class="group-toggle-btn"
                                        class:active={reportGroupBy === 'category'}
                                        on:click={() => { reportGroupBy = 'category'; loadReport() }}
                                    >By category</button>
                                </div>
                                <div class="report-date-row">
                                    <input type="date" class="filter-select date-input" bind:value={reportDateFrom} on:change={loadReport} title="From" />
                                    <span class="date-sep">&ndash;</span>
                                    <input type="date" class="filter-select date-input" bind:value={reportDateTo} on:change={loadReport} title="To" />
                                </div>
                            </div>
                            <div class="filter-presets">
                                <button class="preset-btn" on:click={() => { setReportPreset('thisMonth'); loadReport() }}>This month</button>
                                <button class="preset-btn" on:click={() => { setReportPreset('lastMonth'); loadReport() }}>Last month</button>
                                <button class="preset-btn" on:click={() => { setReportPreset('last90'); loadReport() }}>Last 90 days</button>
                                <button class="preset-btn" on:click={() => { setReportPreset('ytd'); loadReport() }}>Year to date</button>
                                <button class="preset-btn" on:click={() => { setReportPreset('last12'); loadReport() }}>Last 12 months</button>
                            </div>
                        </div>

                        {#if loadingReport}
                            <div class="loading-state">Loading report...</div>
                        {:else if !reportData || reportData.months.length === 0}
                            <div class="empty-state small">
                                <span class="material-symbols-outlined empty-icon">bar_chart</span>
                                <p>No spending data for this period.</p>
                            </div>
                        {:else}
                            <!-- Summary strip -->
                            <div class="report-summary">
                                <div class="summary-stat">
                                    <div class="summary-value">
                                        ${Object.values(reportData.monthlyTotals).reduce((s, v) => s + v, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </div>
                                    <div class="summary-label">Total spending</div>
                                </div>
                                <div class="summary-stat">
                                    <div class="summary-value">
                                        ${reportData.months.length > 0
                                            ? (Object.values(reportData.monthlyTotals).reduce((s, v) => s + v, 0) / reportData.months.length).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                            : '0.00'}
                                    </div>
                                    <div class="summary-label">Avg per month</div>
                                </div>
                                <div class="summary-stat">
                                    <div class="summary-value">{reportData.groups[0] || '—'}</div>
                                    <div class="summary-label">Top {reportGroupBy === 'stream' ? 'stream' : 'category'}</div>
                                </div>
                                <div class="summary-stat">
                                    <div class="summary-value">{reportData.months.length}</div>
                                    <div class="summary-label">Month{reportData.months.length === 1 ? '' : 's'}</div>
                                </div>
                            </div>

                            <!-- Bubble matrix chart -->
                            <div class="chart-wrapper">
                                <svg
                                    width={bmSvgW}
                                    height={bmSvgH}
                                    class="bubble-matrix"
                                    on:mouseleave={() => bubbleTip = null}
                                    role="img"
                                    aria-label="Spending bubble matrix"
                                >
                                    <!-- Column headers (months) -->
                                    {#each reportData.months as month, mi}
                                        {@const cx = BM_PAD_LEFT + mi * BM_COL_W + BM_COL_W / 2}
                                        <text x={cx} y={BM_PAD_TOP - 8} text-anchor="middle" class="bm-label bm-month">
                                            {formatMonth(month)}
                                        </text>
                                    {/each}

                                    <!-- Row lines + labels (groups) -->
                                    {#each reportData.groups as group, gi}
                                        {@const cy = BM_PAD_TOP + gi * BM_ROW_H + BM_ROW_H / 2}
                                        <!-- Row separator -->
                                        <line
                                            x1={BM_PAD_LEFT - 12} y1={cy + BM_ROW_H / 2}
                                            x2={bmSvgW - BM_PAD_RIGHT} y2={cy + BM_ROW_H / 2}
                                            class="bm-rule"
                                        />
                                        <!-- Group label -->
                                        <text x={BM_PAD_LEFT - 16} y={cy + 4} text-anchor="end" class="bm-label bm-group">
                                            {group}
                                        </text>

                                        <!-- Bubbles -->
                                        {#each reportData.months as month, mi}
                                            {@const amount = reportData.data[group]?.[month] || 0}
                                            {@const r = bmRadius(amount)}
                                            {@const bx = BM_PAD_LEFT + mi * BM_COL_W + BM_COL_W / 2}
                                            {#if amount > 0}
                                                <circle
                                                    cx={bx} cy={cy} r={r}
                                                    fill={CHART_COLORS[gi % CHART_COLORS.length]}
                                                    class="bm-bubble"
                                                    on:mouseenter={() => bubbleTip = { x: bx, y: cy - r - 8, group, month, amount }}
                                                    on:mouseleave={() => bubbleTip = null}
                                                    role="presentation"
                                                />
                                            {/if}
                                        {/each}
                                    {/each}

                                    <!-- Tooltip -->
                                    {#if bubbleTip}
                                        {@const tw = 148}
                                        {@const tx = Math.min(Math.max(bubbleTip.x - tw / 2, 4), bmSvgW - tw - 4)}
                                        {@const ty = Math.max(bubbleTip.y - 46, 4)}
                                        <g class="bm-tooltip">
                                            <rect x={tx} y={ty} width={tw} height={40} rx="4" class="bm-tip-bg" />
                                            <text x={tx + tw / 2} y={ty + 14} text-anchor="middle" class="bm-tip-group">{bubbleTip.group}</text>
                                            <text x={tx + tw / 2} y={ty + 30} text-anchor="middle" class="bm-tip-amount">${bubbleTip.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · {formatMonth(bubbleTip.month)}</text>
                                        </g>
                                    {/if}
                                </svg>
                            </div>

                            <!-- Breakdown table -->
                            <div class="report-table-wrapper">
                                <table class="report-table">
                                    <thead>
                                        <tr>
                                            <th>{reportGroupBy === 'stream' ? 'Stream' : 'Category'}</th>
                                            {#each reportData.months as month}
                                                <th class="amount-col">{formatMonth(month)}</th>
                                            {/each}
                                            <th class="amount-col">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {#each reportData.groups as group, gi}
                                            <tr>
                                                <td class="group-name-cell">
                                                    <span class="group-dot" style="background:{CHART_COLORS[gi % CHART_COLORS.length]}"></span>
                                                    {group}
                                                </td>
                                                {#each reportData.months as month}
                                                    <td class="amount-cell">
                                                        {#if reportData.data[group]?.[month]}
                                                            ${reportData.data[group][month].toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        {:else}
                                                            <span class="muted">—</span>
                                                        {/if}
                                                    </td>
                                                {/each}
                                                <td class="amount-cell total-cell">
                                                    ${reportData.totals[group].toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </td>
                                            </tr>
                                        {/each}
                                    </tbody>
                                    <tfoot>
                                        <tr class="total-row">
                                            <td><strong>Total</strong></td>
                                            {#each reportData.months as month}
                                                <td class="amount-cell"><strong>${reportData.monthlyTotals[month]?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '—'}</strong></td>
                                            {/each}
                                            <td class="amount-cell total-cell">
                                                <strong>${Object.values(reportData.monthlyTotals).reduce((s, v) => s + v, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        {/if}
                    </div>

                <!-- ─── Categories Tab ─── -->
                {:else if activeTab === 'categories'}
                    <div class="tab-panel" transition:fly={{ duration: 200, x: -20 }}>
                        <div class="categories-panel">
                            <p class="categories-hint">
                                Manage your transaction categories and assign each to a funding stream.
                                Streams help you see where your money goes at a higher level.
                            </p>

                            {#if loadingCategories}
                                <div class="loading-state">Loading categories...</div>
                            {:else if categories.length === 0 && !addingCategory}
                                <div class="empty-state small">
                                    <span class="material-symbols-outlined empty-icon">category</span>
                                    <p>No categories yet. Add your first category to start organizing transactions.</p>
                                    <button class="link-button" on:click={startAddCategory}>
                                        <span class="material-symbols-outlined">add</span>
                                        Add Category
                                    </button>
                                </div>
                            {:else if categories.length === 0 && addingCategory}
                                <div class="add-category-row">
                                    <input
                                        class="cat-rename-input"
                                        bind:value={newCategoryName}
                                        placeholder="Category name..."
                                        on:keydown={(e) => {
                                            if (e.key === 'Enter') saveNewCategory()
                                            if (e.key === 'Escape') cancelAddCategory()
                                        }}
                                        disabled={savingCategory}
                                    />
                                    <button class="btn-tiny" on:click={saveNewCategory} disabled={savingCategory}>✓</button>
                                    <button class="btn-tiny" on:click={cancelAddCategory}>✕</button>
                                </div>
                            {:else}
                                <table class="categories-table">
                                    <thead>
                                        <tr>
                                            <th>Category</th>
                                            <th>Stream</th>
                                            <th class="tx-count-col">Transactions</th>
                                            <th class="actions-col"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {#each categories as cat (cat.id)}
                                            <tr>
                                                <td class="cat-name-cell">
                                                    {#if renamingCatId === cat.id}
                                                        <div class="cat-rename-edit">
                                                            <input
                                                                class="cat-rename-input"
                                                                bind:value={renameCatValue}
                                                                on:keydown={(e) => {
                                                                    if (e.key === 'Enter') saveRenameCategory(cat)
                                                                    if (e.key === 'Escape') cancelRenameCategory()
                                                                }}
                                                                disabled={savingCategory}
                                                            />
                                                            <button class="btn-tiny" on:click={() => saveRenameCategory(cat)} disabled={savingCategory}>✓</button>
                                                            <button class="btn-tiny" on:click={cancelRenameCategory}>✕</button>
                                                        </div>
                                                    {:else}
                                                        <button class="cat-name-button" on:click={() => startRenameCategory(cat)} title="Click to rename">
                                                            {cat.name}
                                                        </button>
                                                    {/if}
                                                </td>
                                                <td class="cat-stream-cell">
                                                    <select
                                                        class="stream-select"
                                                        value={cat.stream || 'Uncategorized'}
                                                        on:change={(e) => updateCategoryStream(cat, e.currentTarget.value)}
                                                    >
                                                        {#each usedStreams as stream}
                                                            <option value={stream}>{stream}</option>
                                                        {/each}
                                                    </select>
                                                </td>
                                                <td class="tx-count-cell">
                                                    {txCounts[cat.id] || 0}
                                                </td>
                                                <td class="cat-actions-cell">
                                                    <button
                                                        class="btn-icon-danger"
                                                        on:click={() => promptDeleteCategory(cat)}
                                                        title="Delete category"
                                                    >
                                                        <span class="material-symbols-outlined" style="font-size:18px;">delete</span>
                                                    </button>
                                                </td>
                                            </tr>
                                        {/each}
                                    </tbody>
                                </table>

                                <!-- Add category row -->
                                {#if addingCategory}
                                    <div class="add-category-row">
                                        <input
                                            class="cat-rename-input"
                                            bind:value={newCategoryName}
                                            placeholder="Category name..."
                                            on:keydown={(e) => {
                                                if (e.key === 'Enter') saveNewCategory()
                                                if (e.key === 'Escape') cancelAddCategory()
                                            }}
                                            disabled={savingCategory}
                                        />
                                        <button class="btn-tiny" on:click={saveNewCategory} disabled={savingCategory}>✓</button>
                                        <button class="btn-tiny" on:click={cancelAddCategory}>✕</button>
                                    </div>
                                {/if}

                                <div class="categories-footer">
                                    <button class="add-cat-button" on:click={startAddCategory} disabled={addingCategory}>
                                        <span class="material-symbols-outlined" style="font-size:16px;">add</span>
                                        Add Category
                                    </button>
                                </div>
                            {/if}
                        </div>

                        <!-- Delete confirmation dialog -->
                        {#if deletingCategory}
                            <div class="delete-overlay" on:click|self={cancelDeleteCategory} on:keydown={(e) => e.key === 'Escape' && cancelDeleteCategory()} role="presentation">
                                <div class="delete-dialog" role="alertdialog" aria-labelledby="delete-cat-title">
                                    <h3 id="delete-cat-title">Delete "{deletingCategory.name}"?</h3>
                                    {#if (txCounts[deletingCategory.id] || 0) > 0}
                                        <p class="delete-warning">
                                            This category has <strong>{txCounts[deletingCategory.id]}</strong> transaction{txCounts[deletingCategory.id] === 1 ? '' : 's'}.
                                            Choose a category to reassign them to:
                                        </p>
                                        <select class="reassign-select" bind:value={reassignCategoryId}>
                                            <option value="">Select a category...</option>
                                            {#each categories.filter(c => c.id !== deletingCategory?.id) as c}
                                                <option value={c.id}>{c.name}</option>
                                            {/each}
                                        </select>
                                    {:else}
                                        <p>This category has no transactions and can be safely deleted.</p>
                                    {/if}
                                    <div class="delete-dialog-actions">
                                        <button class="btn-cancel" on:click={cancelDeleteCategory}>Cancel</button>
                                        <button
                                            class="btn-danger"
                                            on:click={confirmDeleteCategory}
                                            disabled={savingCategory || ((txCounts[deletingCategory.id] || 0) > 0 && !reassignCategoryId)}
                                        >
                                            {savingCategory ? 'Deleting...' : 'Delete'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        {/if}
                    </div>

                <!-- ─── Scenario Tab ─── -->
                {:else if activeTab === 'scenario'}
                    <div class="tab-panel" transition:fly={{ duration: 200, x: -20 }}>
                        <div class="scenario-panel">

                            <!-- ── Sidebar: baseline + adjustments ── -->
                            <div class="scenario-sidebar">
                                <div class="scenario-baseline">
                                    <div class="sc-field">
                                        <label class="sc-label">Monthly income</label>
                                        <div class="sc-input-wrap">
                                            <span class="sc-prefix">$</span>
                                            <input
                                                class="sc-number"
                                                type="number"
                                                min="0"
                                                step="100"
                                                bind:value={scenario.monthlyIncome}
                                                on:input={() => scenario = { ...scenario }}
                                            />
                                        </div>
                                    </div>
                                    <div class="sc-field">
                                        <label class="sc-label">Monthly expenses</label>
                                        <div class="sc-input-wrap">
                                            <span class="sc-prefix">$</span>
                                            <input
                                                class="sc-number"
                                                type="number"
                                                min="0"
                                                step="100"
                                                bind:value={scenario.monthlyExpenses}
                                                on:input={() => scenario = { ...scenario }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div class="sc-adj-header">
                                    <span class="sc-section-label">Adjustments</span>
                                    <button class="sc-add-btn" on:click={scOpenAddForm} title="Add adjustment">+</button>
                                </div>

                                {#if scShowAddForm}
                                    <div class="sc-add-form">
                                        <input
                                            class="sc-text-input"
                                            type="text"
                                            placeholder="Label (e.g. Car payment)"
                                            bind:value={scNewLabel}
                                        />
                                        <div class="sc-row">
                                            <div class="sc-input-wrap sc-amt-wrap">
                                                <span class="sc-prefix">$</span>
                                                <input
                                                    class="sc-number"
                                                    type="number"
                                                    min="0"
                                                    placeholder="0"
                                                    bind:value={scNewAmount}
                                                />
                                            </div>
                                            <div class="sc-dir-toggle">
                                                <button
                                                    class="sc-dir-btn"
                                                    class:active={scNewDirection === 'income'}
                                                    on:click={() => scNewDirection = 'income'}
                                                >Income</button>
                                                <button
                                                    class="sc-dir-btn"
                                                    class:active={scNewDirection === 'expense'}
                                                    on:click={() => scNewDirection = 'expense'}
                                                >Expense</button>
                                            </div>
                                        </div>
                                        <div class="sc-row">
                                            <input
                                                class="sc-month-input"
                                                type="month"
                                                bind:value={scNewStartMonth}
                                                title="Start month"
                                            />
                                            <div class="sc-type-toggle">
                                                <button
                                                    class="sc-dir-btn"
                                                    class:active={scNewType === 'one-time'}
                                                    on:click={() => scNewType = 'one-time'}
                                                >Once</button>
                                                <button
                                                    class="sc-dir-btn"
                                                    class:active={scNewType === 'recurring'}
                                                    on:click={() => scNewType = 'recurring'}
                                                >Ongoing</button>
                                            </div>
                                        </div>
                                        <div class="sc-form-actions">
                                            <button class="sc-save-btn" on:click={scSaveAdj}>Save</button>
                                            <button class="sc-cancel-btn" on:click={() => scShowAddForm = false}>Cancel</button>
                                        </div>
                                    </div>
                                {/if}

                                {#if scenario.adjustments.length === 0 && !scShowAddForm}
                                    <p class="sc-empty-adjs">No adjustments yet. Press + to add one.</p>
                                {:else}
                                    <ul class="sc-adj-list">
                                        {#each scenario.adjustments as adj}
                                            <li class="sc-adj-item">
                                                <div class="sc-adj-main">
                                                    <span
                                                        class="sc-adj-amount"
                                                        class:income={adj.direction === 'income'}
                                                        class:expense={adj.direction === 'expense'}
                                                    >
                                                        {adj.direction === 'income' ? '+' : '−'}${adj.amount.toLocaleString()}
                                                    </span>
                                                    <span class="sc-adj-label">{adj.label}</span>
                                                </div>
                                                <div class="sc-adj-meta">
                                                    <span class="sc-adj-badge {adj.type === 'one-time' ? 'badge-once' : 'badge-ongoing'}">
                                                        {adj.type === 'one-time' ? 'once' : 'ongoing'}
                                                    </span>
                                                    <span class="sc-adj-from">{scFormatMonth(adj.startMonth)}</span>
                                                    <button class="sc-adj-del" on:click={() => scRemoveAdj(adj.id)} title="Remove">×</button>
                                                </div>
                                            </li>
                                        {/each}
                                    </ul>
                                {/if}
                            </div>

                            <!-- ── Main: summary + chart ── -->
                            <div class="scenario-main">
                                <!-- Summary strip -->
                                <div class="report-summary">
                                    <div class="summary-stat">
                                        <div class="summary-value">{fmtBalance(scenarioSeed)}</div>
                                        <div class="summary-label">Current balance</div>
                                    </div>
                                    <div class="summary-stat">
                                        <div class="summary-value">{fmtBalance(scenarioRows[scenarioRows.length - 1]?.balance ?? 0)}</div>
                                        <div class="summary-label">24-mo projected</div>
                                    </div>
                                    <div class="summary-stat">
                                        <div
                                            class="summary-value"
                                            class:pos={scenario.monthlyIncome - scenario.monthlyExpenses >= 0}
                                            class:neg={scenario.monthlyIncome - scenario.monthlyExpenses < 0}
                                        >
                                            {scenario.monthlyIncome - scenario.monthlyExpenses >= 0 ? '+' : '−'}{fmtBalance(Math.abs(scenario.monthlyIncome - scenario.monthlyExpenses))}
                                        </div>
                                        <div class="summary-label">Monthly net</div>
                                    </div>
                                    <div class="summary-stat">
                                        <div class="summary-value" class:neg={!!scenarioNegMonth}>
                                            {scenarioNegMonth ? scenarioNegMonth.label : '—'}
                                        </div>
                                        <div class="summary-label">Goes negative</div>
                                    </div>
                                </div>

                                <!-- SVG line chart -->
                                <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
                                <div class="scenario-chart-wrap" bind:this={scenarioChartEl} bind:clientWidth={scenarioSvgW}>
                                    <svg
                                        width={scenarioSvgW}
                                        height={SC_H}
                                        class="scenario-chart"
                                        on:mousemove={scHandleMousemove}
                                        on:mouseleave={() => scTip = null}
                                        role="img"
                                        aria-label="24-month balance projection"
                                    >
                                        <!-- Y-axis grid lines + labels -->
                                        {#each scYTicks as tick}
                                            {@const ty = scY(tick)}
                                            <line
                                                x1={SC_PAD_L} y1={ty}
                                                x2={scenarioSvgW - SC_PAD_R} y2={ty}
                                                class="sc-grid-line"
                                            />
                                            <text x={SC_PAD_L - 6} y={ty + 4} text-anchor="end" class="sc-axis-label">{fmtBalance(tick)}</text>
                                        {/each}

                                        <!-- Zero baseline (only shown if there are negative values) -->
                                        {#if scMinBal < 0}
                                            <line
                                                x1={SC_PAD_L} y1={scZeroY()}
                                                x2={scenarioSvgW - SC_PAD_R} y2={scZeroY()}
                                                class="sc-zero-line"
                                            />
                                        {/if}

                                        <!-- Negative zone fill -->
                                        {#if scMinBal < 0}
                                            <path d={scenarioNegPath} class="sc-neg-fill" />
                                        {/if}

                                        <!-- Area fill under curve -->
                                        <path
                                            d={`${scenarioPath} L${scX(SCENARIO_MONTHS - 1, scenarioSvgW).toFixed(1)},${scY(0 > scMinBal ? 0 : scMinBal).toFixed(1)} L${scX(0, scenarioSvgW).toFixed(1)},${scY(0 > scMinBal ? 0 : scMinBal).toFixed(1)} Z`}
                                            class="sc-area-fill"
                                        />

                                        <!-- Main line -->
                                        <path d={scenarioPath} class="sc-line" />

                                        <!-- Month tick marks on X axis -->
                                        {#each scenarioRows as row, i}
                                            {@const x = scX(i, scenarioSvgW)}
                                            {@const showLabel = i === 0 || i === SCENARIO_MONTHS - 1 || i % 6 === 0}
                                            <line
                                                x1={x} y1={SC_H - SC_PAD_B + 4}
                                                x2={x} y2={SC_H - SC_PAD_B + (row.adjs.length > 0 ? 10 : 7)}
                                                class={row.adjs.length > 0 ? 'sc-adj-tick' : 'sc-tick'}
                                            />
                                            {#if showLabel}
                                                <text x={x} y={SC_H - 4} text-anchor="middle" class="sc-axis-label">{row.label}</text>
                                            {/if}
                                        {/each}

                                        <!-- Hover dot + tooltip -->
                                        {#if scTip}
                                            <circle cx={scTip.x} cy={scTip.y} r="5" class="sc-hover-dot" />
                                            {@const tw = 160}
                                            {@const tx = Math.min(Math.max(scTip.x - tw / 2, SC_PAD_L), scenarioSvgW - SC_PAD_R - tw)}
                                            {@const ty = Math.max(scTip.y - 52, 4)}
                                            <g>
                                                <rect x={tx} y={ty} width={tw} height={42} rx="4" class="sc-tip-bg" />
                                                <text x={tx + tw / 2} y={ty + 15} text-anchor="middle" class="sc-tip-label">{scTip.row.label}</text>
                                                <text x={tx + tw / 2} y={ty + 31} text-anchor="middle" class="sc-tip-val">{fmtBalance(scTip.row.balance)}</text>
                                            </g>
                                        {/if}
                                    </svg>
                                </div>
                            </div>

                        </div>
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}

<style>
    /* ── Backdrop & Modal Shell ── */
    .budget-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.6);
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .budget-modal {
        background: var(--white);
        border-radius: 0;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
    }

    /* ── Header ── */
    .budget-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0 1.25rem;
        height: 59px;
        border-bottom: 1px solid #ddd;
        flex-shrink: 0;
    }

    .budget-header h2 {
        font-family: var(--font-primary);
        font-size: 1rem;
        font-weight: 500;
        color: #333;
        margin: 0;
    }

    .header-actions {
        display: flex;
        align-items: center;
        gap: var(--space-2);
    }

    .sync-button {
        background: white;
        border: 1px solid #ddd;
        border-radius: 0;
        cursor: pointer;
        padding: 0.2rem 0.4rem;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
        color: #666;
    }

    .sync-button:hover {
        background: #f5f5f5;
        color: #333;
    }

    .sync-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .spinning {
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }

    .close-button {
        background: white;
        border: 1px solid #ddd;
        border-radius: 0;
        font-size: 24px;
        color: #666;
        cursor: pointer;
        padding: 0.1rem 0.3rem 0.25rem;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
    }

    .close-button:hover {
        background: #f5f5f5;
        color: #333;
    }

    /* ── Tabs ── */
    .budget-tabs {
        display: flex;
        border-bottom: 1px solid #ddd;
        padding: 0 1.25rem;
        flex-shrink: 0;
    }

    .tab-button {
        background: none;
        border: none;
        border-bottom: 2px solid transparent;
        padding: var(--space-3) var(--space-4);
        font-family: var(--font-primary);
        font-size: 13px;
        font-weight: 500;
        color: var(--gray-500);
        cursor: pointer;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        transition: all var(--transition-fast);
    }

    .tab-button:hover {
        color: var(--gray-700);
    }

    .tab-button.active {
        color: var(--gray-700);
        border-bottom-color: var(--gray-700);
    }

    /* ── Content area ── */
    .budget-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-height: 0;
        overflow: hidden;
    }

    .tab-panel {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-height: 0;
        overflow-y: auto;
        padding: var(--space-6);
    }

    .tab-panel.overview-panel {
        padding: 0;
        overflow: hidden;
    }

    .error-banner {
        background: var(--error-bg);
        color: var(--error-text);
        border: 1px solid var(--error-border);
        padding: var(--space-2) var(--space-4);
        margin-bottom: var(--space-4);
        font-size: 13px;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .dismiss-error {
        background: none;
        border: none;
        color: var(--error-text);
        font-size: 16px;
        cursor: pointer;
        padding: 0 var(--space-1);
    }

    .loading-state {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 200px;
        color: var(--gray-500);
        font-size: 14px;
    }

    /* ── Empty states ── */
    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: var(--space-10) var(--space-6);
        gap: var(--space-3);
    }

    .empty-state.small {
        padding: var(--space-6);
    }

    .empty-icon {
        font-size: 48px;
        color: var(--gray-300);
    }

    .empty-state h3 {
        font-family: var(--font-primary);
        font-size: 16px;
        font-weight: 600;
        color: var(--gray-700);
        margin: 0;
    }

    .empty-state p {
        font-size: 14px;
        color: var(--gray-500);
        max-width: 320px;
        line-height: 1.5;
        margin: 0;
    }

    .link-button {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        background: var(--gray-700);
        color: var(--white);
        border: 1px solid var(--gray-700);
        padding: var(--space-2) var(--space-5);
        font-family: var(--font-primary);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all var(--transition-fast);
    }

    .link-button:hover {
        background: var(--black);
        border-color: var(--black);
    }

    .link-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .link-button .material-symbols-outlined {
        font-size: 18px;
    }

    /* ── Overview split layout ── */
    .split-panel {
        display: flex;
        height: 100%;
        min-height: 0;
    }

    /* Accounts sidebar */
    .accounts-sidebar {
        width: 300px;
        flex-shrink: 0;
        border-right: 1px solid #e8e8e8;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        padding: var(--space-2) 0;
    }

    .sidebar-acct-item {
        display: flex;
        align-items: flex-start;
        gap: var(--space-2);
        padding: var(--space-3) var(--space-4);
        background: none;
        border: none;
        border-left: 2px solid transparent;
        width: 100%;
        text-align: left;
        cursor: pointer;
        font-family: var(--font-primary);
        transition: background var(--transition-fast);
    }

    .sidebar-acct-item:hover {
        background: var(--gray-50);
    }

    .sidebar-acct-item.active {
        background: var(--gray-50);
        border-left-color: var(--gray-700);
    }

    .sidebar-acct-icon {
        font-size: 18px;
        color: var(--gray-400);
        flex-shrink: 0;
    }

    .sidebar-acct-info {
        flex: 1;
        min-width: 0;
    }

    .sidebar-acct-name {
        font-size: 13px;
        font-weight: 500;
        color: var(--gray-700);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .sidebar-acct-meta {
        font-size: 11px;
        color: var(--gray-400);
        margin-top: 1px;
    }

    .sidebar-acct-balance {
        font-size: 12px;
        font-weight: 600;
        color: var(--gray-700);
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
        flex-shrink: 0;
    }

    .sidebar-footer {
        margin-top: auto;
        padding: var(--space-4);
        border-top: 1px solid #e8e8e8;
    }

    .sidebar-footer .link-button {
        width: 100%;
        justify-content: center;
        font-size: 12px;
        padding: var(--space-2) var(--space-3);
    }

    /* Transactions main */
    .transactions-main {
        flex: 1;
        overflow-y: auto;
        padding: var(--space-4) var(--space-5);
        min-width: 0;
    }

    /* Mobile: sidebar becomes horizontal chip strip */
    @media (max-width: 600px) {
        .split-panel {
            flex-direction: column;
        }

        .accounts-sidebar {
            width: 100%;
            border-right: none;
            border-bottom: 1px solid #e8e8e8;
            flex-direction: row;
            overflow-x: auto;
            overflow-y: hidden;
            padding: var(--space-2);
            gap: var(--space-1);
        }

        .sidebar-acct-item {
            flex-direction: column;
            align-items: center;
            gap: 2px;
            padding: var(--space-2) var(--space-3);
            border-left: none;
            border-bottom: 2px solid transparent;
            flex-shrink: 0;
            white-space: nowrap;
        }

        .sidebar-acct-item.active {
            border-left-color: transparent;
            border-bottom-color: var(--gray-700);
        }

        .sidebar-acct-meta,
        .sidebar-acct-balance {
            display: none;
        }

        .sidebar-footer {
            display: none;
        }

        .transactions-main {
            padding: var(--space-3);
        }
    }

    /* ── Transactions ── */
    .transaction-filters {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        margin-bottom: var(--space-4);
    }

    .filter-row {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        flex-wrap: wrap;
    }

    .date-input {
        width: 140px;
    }

    .date-sep {
        color: var(--gray-400);
        font-size: 13px;
    }

    .filter-presets {
        display: flex;
        gap: var(--space-2);
        flex-wrap: wrap;
    }

    .preset-btn {
        background: none;
        border: 1px solid var(--gray-200);
        padding: 2px 10px;
        font-family: var(--font-primary);
        font-size: 11px;
        color: var(--gray-500);
        cursor: pointer;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        transition: all var(--transition-fast);
    }

    .preset-btn:hover {
        border-color: var(--gray-500);
        color: var(--gray-700);
    }

    .filter-select {
        border: 1px solid var(--gray-300);
        border-radius: 0;
        padding: var(--space-2) var(--space-3);
        font-family: var(--font-primary);
        font-size: 13px;
        color: var(--gray-700);
        background: var(--white);
        cursor: pointer;
    }

    .filter-select:focus {
        outline: none;
        border-color: var(--gray-700);
    }

    .transactions-table-wrapper {
        overflow-x: auto;
    }

    .transactions-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
    }

    .transactions-table th {
        text-align: left;
        padding: var(--space-2) var(--space-3);
        font-weight: 600;
        color: var(--gray-600);
        border-bottom: 2px solid var(--gray-200);
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .transactions-table th.sortable {
        cursor: pointer;
        user-select: none;
        white-space: nowrap;
    }

    .transactions-table th.sortable:hover {
        color: var(--gray-800);
    }

    .transactions-table td {
        padding: var(--space-3);
        border-bottom: 1px solid #f0f0f0;
        vertical-align: top;
    }

    .transactions-table tr:hover td {
        background: var(--gray-50);
    }

    .transactions-table tr.pending td {
        opacity: 0.6;
    }

    .date-cell {
        white-space: nowrap;
        font-size: 12px;
        color: var(--gray-600);
    }

    .pending-badge {
        display: inline-block;
        font-size: 10px;
        background: #fff3cd;
        color: #856404;
        padding: 1px 5px;
        margin-left: 4px;
        font-weight: 600;
        text-transform: uppercase;
    }

    .desc-cell {
        max-width: 300px;
    }

    .tx-description {
        color: var(--gray-700);
        font-weight: 500;
    }

    .tx-merchant {
        font-size: 11px;
        color: var(--gray-500);
        margin-top: 2px;
    }

    .category-cell {
        min-width: 120px;
    }

    .category-label {
        background: var(--gray-50);
        border: 1px solid var(--gray-200);
        padding: 2px 8px;
        font-size: 12px;
        color: var(--gray-600);
        cursor: pointer;
        transition: all var(--transition-fast);
        font-family: var(--font-primary);
    }

    .category-label:hover {
        border-color: var(--gray-400);
        color: var(--gray-700);
    }

    .category-edit {
        display: flex;
        align-items: center;
        gap: 4px;
    }

    .category-input {
        border: 1px solid var(--gray-300);
        padding: 2px 6px;
        font-size: 12px;
        font-family: var(--font-primary);
        width: 100px;
    }

    .category-input:focus {
        outline: none;
        border-color: var(--gray-700);
    }

    .btn-tiny {
        background: none;
        border: none;
        font-size: 14px;
        cursor: pointer;
        padding: 0 2px;
        color: var(--gray-500);
    }

    .btn-tiny:hover {
        color: var(--gray-700);
    }

    .amount-col {
        text-align: right;
    }

    .amount-cell {
        text-align: right;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        color: var(--gray-700);
    }

    .amount-cell.negative {
        color: var(--error-text);
    }

    /* ── Categories Tab ── */
    .categories-panel {
        max-width: 700px;
    }

    .categories-hint {
        font-size: 13px;
        color: var(--gray-500);
        line-height: 1.5;
        margin-bottom: var(--space-5);
    }

    .categories-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
    }

    .categories-table th {
        text-align: left;
        padding: var(--space-2) var(--space-3);
        font-weight: 600;
        color: var(--gray-600);
        border-bottom: 2px solid var(--gray-200);
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .categories-table td {
        padding: var(--space-3);
        border-bottom: 1px solid #f0f0f0;
        vertical-align: middle;
    }

    .categories-table tr:hover td {
        background: var(--gray-50);
    }

    .tx-count-col,
    .tx-count-cell {
        text-align: center;
        width: 100px;
    }

    .tx-count-cell {
        font-variant-numeric: tabular-nums;
        color: var(--gray-500);
        font-size: 12px;
    }

    .actions-col,
    .cat-actions-cell {
        width: 50px;
        text-align: center;
    }

    .cat-name-cell {
        min-width: 150px;
    }

    .cat-name-button {
        background: none;
        border: none;
        padding: 2px 4px;
        font-family: var(--font-primary);
        font-size: 13px;
        font-weight: 500;
        color: var(--gray-700);
        cursor: pointer;
        transition: all var(--transition-fast);
        border-bottom: 1px dashed transparent;
    }

    .cat-name-button:hover {
        border-bottom-color: var(--gray-400);
        color: var(--black);
    }

    .cat-rename-edit {
        display: flex;
        align-items: center;
        gap: 4px;
    }

    .cat-rename-input {
        border: 1px solid var(--gray-300);
        padding: 3px 8px;
        font-size: 13px;
        font-family: var(--font-primary);
        width: 140px;
    }

    .cat-rename-input:focus {
        outline: none;
        border-color: var(--gray-700);
    }

    .cat-stream-cell {
        min-width: 160px;
    }

    .stream-select {
        border: 1px solid var(--gray-200);
        border-radius: 0;
        padding: 3px 8px;
        font-family: var(--font-primary);
        font-size: 12px;
        color: var(--gray-700);
        background: var(--white);
        cursor: pointer;
        width: 100%;
        max-width: 200px;
    }

    .stream-select:focus {
        outline: none;
        border-color: var(--gray-700);
    }

    .btn-icon-danger {
        background: none;
        border: none;
        color: var(--gray-400);
        cursor: pointer;
        padding: 4px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: color var(--transition-fast);
    }

    .btn-icon-danger:hover {
        color: var(--error-text, #dc3545);
    }

    /* ── Add category ── */
    .add-category-row {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: var(--space-3);
    }

    .categories-footer {
        margin-top: var(--space-4);
        padding-top: var(--space-3);
        border-top: 1px solid #f0f0f0;
    }

    .add-cat-button {
        display: inline-flex;
        align-items: center;
        gap: var(--space-1);
        background: none;
        border: 1px dashed var(--gray-300);
        padding: var(--space-2) var(--space-3);
        font-family: var(--font-primary);
        font-size: 12px;
        color: var(--gray-500);
        cursor: pointer;
        transition: all var(--transition-fast);
    }

    .add-cat-button:hover {
        border-color: var(--gray-500);
        color: var(--gray-700);
    }

    .add-cat-button:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }

    /* ── Delete dialog ── */
    .delete-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.4);
        z-index: 1100;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .delete-dialog {
        background: var(--white);
        border: 1px solid var(--gray-200);
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        padding: var(--space-6);
        max-width: 420px;
        width: 90%;
    }

    .delete-dialog h3 {
        font-family: var(--font-primary);
        font-size: 15px;
        font-weight: 600;
        color: var(--gray-700);
        margin: 0 0 var(--space-4);
    }

    .delete-dialog p {
        font-size: 13px;
        color: var(--gray-600);
        line-height: 1.5;
        margin: 0 0 var(--space-4);
    }

    .delete-warning {
        color: var(--error-text, #dc3545);
    }

    .reassign-select {
        width: 100%;
        border: 1px solid var(--gray-300);
        border-radius: 0;
        padding: var(--space-2) var(--space-3);
        font-family: var(--font-primary);
        font-size: 13px;
        color: var(--gray-700);
        background: var(--white);
        margin-bottom: var(--space-4);
    }

    .reassign-select:focus {
        outline: none;
        border-color: var(--gray-700);
    }

    .delete-dialog-actions {
        display: flex;
        justify-content: flex-end;
        gap: var(--space-3);
    }

    .btn-cancel {
        background: var(--white);
        border: 1px solid var(--gray-300);
        padding: var(--space-2) var(--space-4);
        font-family: var(--font-primary);
        font-size: 13px;
        color: var(--gray-600);
        cursor: pointer;
        transition: all var(--transition-fast);
    }

    .btn-cancel:hover {
        background: var(--gray-50);
        color: var(--gray-700);
    }

    .btn-danger {
        background: var(--error-text, #dc3545);
        border: 1px solid var(--error-text, #dc3545);
        padding: var(--space-2) var(--space-4);
        font-family: var(--font-primary);
        font-size: 13px;
        color: var(--white);
        cursor: pointer;
        transition: all var(--transition-fast);
    }

    .btn-danger:hover {
        opacity: 0.9;
    }

    .btn-danger:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    /* ── Reports ── */
    .report-controls {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        margin-bottom: var(--space-5);
    }

    .report-top-row {
        display: flex;
        align-items: center;
        gap: var(--space-4);
        flex-wrap: wrap;
    }

    .report-group-toggle {
        display: flex;
        border: 1px solid var(--gray-300);
    }

    .group-toggle-btn {
        background: none;
        border: none;
        padding: var(--space-2) var(--space-4);
        font-family: var(--font-primary);
        font-size: 12px;
        font-weight: 500;
        color: var(--gray-500);
        cursor: pointer;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        transition: all var(--transition-fast);
    }

    .group-toggle-btn:first-child {
        border-right: 1px solid var(--gray-300);
    }

    .group-toggle-btn.active {
        background: var(--gray-700);
        color: var(--white);
    }

    .report-date-row {
        display: flex;
        align-items: center;
        gap: var(--space-2);
    }

    .report-summary {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: var(--space-4);
        margin-bottom: var(--space-6);
        padding: var(--space-4);
        background: var(--gray-50);
        border: 1px solid var(--gray-100);
    }

    .summary-stat {
        text-align: center;
    }

    .summary-value {
        font-size: 18px;
        font-weight: 600;
        color: var(--gray-800);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .summary-label {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        color: var(--gray-500);
        margin-top: 3px;
    }

    .chart-wrapper {
        overflow-x: auto;
        margin-bottom: var(--space-6);
    }

    .bubble-matrix {
        display: block;
        min-width: 100%;
    }

    .bm-label {
        font-family: var(--font-primary);
        fill: var(--gray-500);
    }

    .bm-month {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.4px;
    }

    .bm-group {
        font-size: 12px;
        font-weight: 500;
        fill: var(--gray-700);
    }

    .bm-rule {
        stroke: #f0f0f0;
        stroke-width: 1;
    }

    .bm-bubble {
        opacity: 0.65;
        cursor: crosshair;
        transition: opacity 0.15s;
    }

    .bm-bubble:hover {
        opacity: 1;
    }

    .bm-tip-bg {
        fill: #1a1a1a;
    }

    .bm-tip-group {
        font-family: var(--font-primary);
        font-size: 11px;
        font-weight: 600;
        fill: white;
        text-transform: uppercase;
        letter-spacing: 0.4px;
    }

    .bm-tip-amount {
        font-family: var(--font-primary);
        font-size: 11px;
        fill: #ccc;
    }

    .report-table-wrapper {
        overflow-x: auto;
    }

    .report-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
    }

    .report-table th {
        text-align: left;
        padding: var(--space-2) var(--space-3);
        font-weight: 600;
        color: var(--gray-600);
        border-bottom: 2px solid var(--gray-200);
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        white-space: nowrap;
    }

    .report-table th.amount-col {
        text-align: center;
    }

    .report-table td.amount-cell {
        text-align: center;
    }

    .report-table td {
        padding: var(--space-2) var(--space-3);
        border-bottom: 1px solid #f0f0f0;
        vertical-align: middle;
    }

    .report-table tbody tr:hover td {
        background: var(--gray-50);
    }

    .report-table tfoot td {
        border-top: 2px solid var(--gray-200);
        border-bottom: none;
        padding-top: var(--space-3);
    }

    .group-name-cell {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        min-width: 120px;
        font-weight: 500;
        color: var(--gray-700);
    }

    .group-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        flex-shrink: 0;
    }

    .total-cell {
        font-weight: 600;
        color: var(--gray-800);
        background: var(--gray-50) !important;
    }

    .muted {
        color: var(--gray-300);
    }

    @media (max-width: 600px) {
        .report-summary {
            grid-template-columns: repeat(2, 1fr);
        }

        .report-top-row {
            flex-direction: column;
            align-items: flex-start;
        }

    }



    /* ── Tab panel ── */
    .tab-panel {
        min-height: 200px;
    }

    /* ── Mobile ── */
    @media (max-width: 768px) {
        .budget-modal {
            max-width: 100%;
            max-height: 100vh;
        }

        .transaction-filters {
            flex-direction: column;
        }

        .transactions-table {
            font-size: 12px;
        }

        .desc-cell {
            max-width: 180px;
        }
    }

    /* ── Scenario Explorer ── */
    .scenario-panel {
        display: flex;
        gap: var(--space-6);
        align-items: flex-start;
    }

    .scenario-sidebar {
        width: 260px;
        flex-shrink: 0;
    }

    .scenario-main {
        flex: 1;
        min-width: 0;
    }

    .scenario-baseline {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        margin-bottom: var(--space-5);
    }

    .sc-field {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
    }

    .sc-label {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        color: var(--gray-500);
        font-weight: 600;
    }

    .sc-input-wrap {
        display: flex;
        align-items: center;
        border: 1px solid var(--gray-200);
        border-radius: 4px;
        overflow: hidden;
        background: white;
    }

    .sc-prefix {
        padding: 0 var(--space-2);
        font-size: 13px;
        color: var(--gray-500);
        background: var(--gray-50);
        border-right: 1px solid var(--gray-200);
        height: 100%;
        display: flex;
        align-items: center;
        align-self: stretch;
    }

    .sc-number {
        border: none;
        outline: none;
        padding: var(--space-2) var(--space-2);
        font-size: 13px;
        width: 100%;
        background: white;
        color: var(--gray-800);
        font-variant-numeric: tabular-nums;
    }

    .sc-number::-webkit-inner-spin-button,
    .sc-number::-webkit-outer-spin-button {
        opacity: 0.4;
    }

    .sc-adj-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--space-3);
    }

    .sc-section-label {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        color: var(--gray-500);
        font-weight: 600;
    }

    .sc-add-btn {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        border: 1px solid var(--gray-300);
        background: white;
        color: var(--gray-600);
        font-size: 16px;
        line-height: 1;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background var(--transition-fast), color var(--transition-fast);
    }

    .sc-add-btn:hover {
        background: var(--gray-800);
        color: white;
        border-color: var(--gray-800);
    }

    .sc-add-form {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        padding: var(--space-3);
        background: var(--gray-50);
        border: 1px solid var(--gray-200);
        border-radius: 6px;
        margin-bottom: var(--space-3);
    }

    .sc-text-input,
    .sc-month-input {
        border: 1px solid var(--gray-200);
        border-radius: 4px;
        padding: var(--space-2) var(--space-2);
        font-size: 12px;
        outline: none;
        background: white;
        color: var(--gray-800);
        width: 100%;
        box-sizing: border-box;
    }

    .sc-row {
        display: flex;
        gap: var(--space-2);
        align-items: center;
    }

    .sc-amt-wrap {
        flex: 1;
        min-width: 0;
    }

    .sc-dir-toggle,
    .sc-type-toggle {
        display: flex;
        border: 1px solid var(--gray-200);
        border-radius: 4px;
        overflow: hidden;
        flex-shrink: 0;
    }

    .sc-dir-btn {
        padding: var(--space-1) var(--space-2);
        font-size: 11px;
        font-weight: 500;
        border: none;
        background: white;
        color: var(--gray-500);
        cursor: pointer;
        transition: background var(--transition-fast), color var(--transition-fast);
    }

    .sc-dir-btn.active {
        background: var(--gray-800);
        color: white;
    }

    .sc-form-actions {
        display: flex;
        gap: var(--space-2);
        justify-content: flex-end;
        margin-top: var(--space-1);
    }

    .sc-save-btn {
        padding: var(--space-1) var(--space-3);
        font-size: 12px;
        font-weight: 600;
        background: var(--gray-800);
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    }

    .sc-cancel-btn {
        padding: var(--space-1) var(--space-3);
        font-size: 12px;
        background: white;
        color: var(--gray-600);
        border: 1px solid var(--gray-200);
        border-radius: 4px;
        cursor: pointer;
    }

    .sc-empty-adjs {
        font-size: 12px;
        color: var(--gray-400);
        margin: 0;
    }

    .sc-adj-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
    }

    .sc-adj-item {
        background: var(--gray-50);
        border: 1px solid var(--gray-100);
        border-radius: 5px;
        padding: var(--space-2) var(--space-3);
    }

    .sc-adj-main {
        display: flex;
        align-items: baseline;
        gap: var(--space-2);
        margin-bottom: 2px;
    }

    .sc-adj-amount {
        font-size: 13px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
    }

    .sc-adj-amount.income { color: #10b981; }
    .sc-adj-amount.expense { color: #ef4444; }

    .sc-adj-label {
        font-size: 12px;
        color: var(--gray-700);
        flex: 1;
    }

    .sc-adj-meta {
        display: flex;
        align-items: center;
        gap: var(--space-2);
    }

    .sc-adj-badge {
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        padding: 1px 6px;
        border-radius: 10px;
    }

    .badge-once {
        background: #fef3c7;
        color: #92400e;
    }

    .badge-ongoing {
        background: #dbeafe;
        color: #1e40af;
    }

    .sc-adj-from {
        font-size: 11px;
        color: var(--gray-400);
        flex: 1;
    }

    .sc-adj-del {
        background: none;
        border: none;
        color: var(--gray-300);
        cursor: pointer;
        font-size: 16px;
        line-height: 1;
        padding: 0;
    }

    .sc-adj-del:hover { color: var(--gray-600); }

    /* Scenario chart */
    .scenario-chart-wrap {
        width: 100%;
    }

    .scenario-chart {
        display: block;
        overflow: visible;
    }

    .sc-grid-line {
        stroke: #f0f0f0;
        stroke-width: 1;
    }

    .sc-zero-line {
        stroke: var(--gray-300);
        stroke-width: 1.5;
        stroke-dasharray: 4 3;
    }

    .sc-neg-fill {
        fill: #fca5a5;
        opacity: 0.2;
    }

    .sc-area-fill {
        fill: #3b82f6;
        opacity: 0.08;
    }

    .sc-line {
        fill: none;
        stroke: #3b82f6;
        stroke-width: 2.5;
        stroke-linejoin: round;
        stroke-linecap: round;
    }

    .sc-tick {
        stroke: var(--gray-300);
        stroke-width: 1;
    }

    .sc-adj-tick {
        stroke: #f59e0b;
        stroke-width: 2;
    }

    .sc-axis-label {
        font-family: var(--font-primary);
        font-size: 10px;
        fill: var(--gray-400);
    }

    .sc-hover-dot {
        fill: #3b82f6;
        stroke: white;
        stroke-width: 2;
    }

    .sc-tip-bg {
        fill: #1a1a1a;
    }

    .sc-tip-label {
        font-family: var(--font-primary);
        font-size: 11px;
        font-weight: 600;
        fill: white;
        text-transform: uppercase;
        letter-spacing: 0.3px;
    }

    .sc-tip-val {
        font-family: var(--font-primary);
        font-size: 13px;
        font-weight: 700;
        fill: #60a5fa;
    }

    .pos { color: #10b981; }
    .neg { color: #ef4444; }

    @media (max-width: 680px) {
        .scenario-panel {
            flex-direction: column;
        }
        .scenario-sidebar {
            width: 100%;
        }
    }
</style>
