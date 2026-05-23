async function sendVerificationCodeByEmail(toEmail, code, type) {
    console.log('[通知] 邮件发送功能已禁用，验证码:', code);
    return { success: false, message: '邮件发送功能已禁用' };
}

async function sendOrderNotification(order, status, toEmail, toPhone) {
    console.log('[通知] 邮件发送功能已禁用');
    return { success: false, notifications: [] };
}

async function sendRefundNotification(refund, toEmail, toPhone) {
    console.log('[通知] 邮件发送功能已禁用');
    return { success: false, notifications: [] };
}

module.exports = {
    sendVerificationCodeByEmail,
    sendOrderNotification,
    sendRefundNotification
};
