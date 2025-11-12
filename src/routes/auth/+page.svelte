<script lang="ts">
    import { supabase } from '$lib/supabase.js'
    import { goto } from '$app/navigation'
    import { page } from '$app/stores'
    import Header from '$lib/components/Header.svelte'
    
    let email = ''
    let otpCode = ''
    let isLoading = false
    let message = ''
    let messageType: 'success' | 'error' = 'success'
    let showOtpInput = false
    
    // Check if user is coming back after email verification (fallback for magic links)
    $: if ($page.url.hash) {
        handleAuthCallback()
    }
    
    async function handleAuthCallback() {
        const hashParams = new URLSearchParams($page.url.hash.substring(1))
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')
        
        if (accessToken && refreshToken) {
            const { error } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken
            })
            
            if (error) {
                message = 'Authentication failed. Please try again.'
                messageType = 'error'
            } else {
                goto('/', { replaceState: true })
            }
        }
    }
    
    async function sendOTP() {
        if (!email.trim()) {
            message = 'Please enter your email address.'
            messageType = 'error'
            return
        }
        
        isLoading = true
        message = ''
        
        const { error } = await supabase.auth.signInWithOtp({
            email: email.trim(),
            options: {
                shouldCreateUser: true
            }
        })
        
        isLoading = false
        
        if (error) {
            message = error.message
            messageType = 'error'
        } else {
            showOtpInput = true
        }
    }
    
    async function verifyOTP() {
        if (!otpCode.trim() || otpCode.length !== 6) {
            message = 'Please enter the 6-digit code from your email.'
            messageType = 'error'
            return
        }
        
        isLoading = true
        message = ''
        
        const { data, error } = await supabase.auth.verifyOtp({
            email: email.trim(),
            token: otpCode.trim(),
            type: 'email'
        })
        
        isLoading = false
        
        if (error) {
            message = error.message
            messageType = 'error'
        } else if (data.session) {
            // Successfully signed in
            goto('/', { replaceState: true })
        } else {
            message = 'Invalid code. Please try again.'
            messageType = 'error'
        }
    }
    
    function resetForm() {
        showOtpInput = false
        otpCode = ''
        message = ''
    }
    
    function handleEmailKeydown(event: KeyboardEvent) {
        if (event.key === 'Enter') {
            sendOTP()
        }
    }
    
    function handleOtpKeydown(event: KeyboardEvent) {
        if (event.key === 'Enter') {
            verifyOTP()
        }
    }
</script>

<svelte:head>
    <title>Sign In - lisocal</title>
</svelte:head>

<Header data={null} calendarId="" calendarName=""/>
<div class="auth-container">
    <div class="auth-card">
        <div class="auth-header">
            <div class="auth-header-row">
            <img src="/logo_250.png" alt="lisocal logo" width="25" height="25" />
            <h1 class=brand_name>lisocal</h1>
            </div>
            <p>Sign in to access your calendar</p>
        </div>
        
        <div class="auth-form">
            {#if !showOtpInput}
                <div class="input-group">
                    <label for="email">Email Address</label>
                    <input 
                        id="email"
                        type="email" 
                        bind:value={email}
                        on:keydown={handleEmailKeydown}
                        placeholder="your@email.com"
                        disabled={isLoading}
                    />
                </div>
                
                <button 
                    class="auth-button" 
                    class:loading={isLoading}
                    on:click={sendOTP}
                    disabled={isLoading}
                >
                    {isLoading ? 'Sending...' : 'Send Code'}
                </button>
            {:else}
                <div class="input-group">
                    <label for="email">Email Address</label>
                    <input 
                        id="email-display"
                        type="email" 
                        bind:value={email}
                        disabled={true}
                        class="disabled-input"
                    />
                </div>
                
                <div class="input-group">
                    <label for="otp">6-Digit Code</label>
                    <input 
                        id="otp"
                        type="text" 
                        bind:value={otpCode}
                        on:keydown={handleOtpKeydown}
                        placeholder="123456"
                        maxlength="6"
                        pattern="[0-9]*"
                        inputmode="numeric"
                        disabled={isLoading}
                        class="otp-input"
                    />
                </div>
                
                <button 
                    class="auth-button" 
                    class:loading={isLoading}
                    on:click={verifyOTP}
                    disabled={isLoading || otpCode.length !== 6}
                >
                    {isLoading ? 'Verifying...' : 'Verify Code'}
                </button>                
            {/if}
            
            {#if message}
                <div class="message" class:error={messageType === 'error'} class:success={messageType === 'success'}>
                    {message}
                </div>
            {/if}
        </div>
        
        <div class="auth-info">
            <p>
                {#if !showOtpInput}
                    We'll send you a 6-digit code to sign in.<br> No passwords needed!
                    <br><br>
                    New to lisocal? Your account will be created automatically.
                {:else}
                    Check your email for the code and enter it above.
                    The code expires in 10 minutes for security.
                {/if}
            </p>
        </div>
        
        <div class="auth-footer">
            <a href="/" class="back-link">← Back to Calendar</a>
        </div>
    </div>
</div>

<style>
    :global(body) {
        margin: 0;
        min-height: 100vh;
    }
    
    .auth-container {
        min-height: 100vh;
        display: flex;
        align-items: flex-start;
        margin-top: 100px;
        justify-content: center;
        padding: var(--space-5);
    }
    
    .auth-card {
        background: var(--white);
        border-radius: var(--radius-small-default);
        box-shadow: var(--shadow-md);
        max-width: 400px;
        width: 100%;
        overflow: hidden;
    }
    
    .auth-header {
        padding: var(--space-8) var(--space-8) var(--space-6);
        text-align: center;
        background: var(--gray-50);
        border-bottom: 1px solid #e9ecef;
    }
    
    .auth-header-row {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        margin-bottom: var(--space-4);
    }
    .auth-header h1 {
        float: right;
        margin: 0 0 var(--space-2) 0;
        font-size: 28px;
        font-weight: 700;
    }
    
    .auth-header p {
        margin: 0;
        color: var(--gray-600);
        font-size: 16px;
    }
    
    .auth-form {
        padding: var(--space-8);
    }

    .brand_name {
        font-family: var(--font-secondary);
        font-weight: 700;
        padding-top: 5px;
        color: #646565;
    }   
    
    .input-group {
        margin-bottom: var(--space-6);
    }
    
    .input-group label {
        display: block;
        margin-bottom: var(--space-2);
        font-weight: 600;
        color: var(--dark-text);
        font-size: 14px;
    }
    
    .input-group input {
        /* Uses global .input styles with size override */
        width: 100%;
        font-size: 16px;
        padding: var(--space-3) var(--space-4);
    }
    
    .input-group input:disabled {
        background: var(--gray-100);
        cursor: not-allowed;
    }
    
    .auth-button {
        /* Uses .btn .btn-primary styles with custom sizing */
        width: 100%;
        padding: var(--space-3) var(--space-6);
        font-size: 16px;
        font-weight: 600;
        margin-bottom: var(--space-4);
    }
    
    .auth-button:hover:not(:disabled) {
        background: var(--primary-hover);
        transform: translateY(-1px);
    }
    
    .auth-button:disabled {
        background: #ccc;
        cursor: not-allowed;
        transform: none;
    }
    
    .auth-button.loading {
        position: relative;
    }
    
    .disabled-input {
        background: #f5f5f5 !important;
        color: #999 !important;
        cursor: not-allowed !important;
    }
    
    .otp-input {
        text-align: center;
        font-size: 18px;
        letter-spacing: 0.5em;
        font-weight: 600;
    }
    
    .message {
        padding: 12px 16px;
        border-radius: var(--radius-small-default)px;
        font-size: 14px;
        text-align: center;
    }
    
    .message.success {
        background: #d4edda;
        color: #155724;
        border: 1px solid #c3e6cb;
    }
    
    .message.error {
        background: #f8d7da;
        color: #721c24;
        border: 1px solid #f5c6cb;
    }
    
    .auth-info {
        padding: 0 32px 24px;
        text-align: center;
    }
    
    .auth-info p {
        color: #666;
        font-size: 14px;
        line-height: 1.5;
        margin: 0;
    }
    
    .auth-footer {
        padding: 24px 32px;
        background: #f8f9fa;
        border-top: 1px solid #e9ecef;
        text-align: center;
    }
    
    .back-link {
        color: #2196f3;
        text-decoration: none;
        font-weight: 500;
        font-size: 14px;
        transition: color 0.2s;
    }
    
    .back-link:hover {
        color: #1976d2;
    }
    
    @media (max-width: 480px) {
        .auth-card {
            margin: 0;
            border-radius: var(--radius-small-default);
            min-height: 100vh;
        }
        
        .auth-container {
            padding: 0;
        }
    }
</style>