require('dotenv').config(); // 加载环境变量
const nodemailer = require('nodemailer');
const sgMail = require('@sendgrid/mail');
const emailjs = require('@emailjs/nodejs');

// 配置邮件服务优先级和选择
const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || 'nodemailer'; // 可选: 'sendgrid', 'nodemailer', 'emailjs'

// 邮箱配置
const EMAIL_CONFIG = {
    user: process.env.EMAIL_USER || '',
    pass: process.env.EMAIL_PASS || '',
    host: (process.env.EMAIL_USER || '').includes('gmail') ? 'smtp.gmail.com' : 'smtp.qq.com',
    port: 587
};

// SendGrid配置
const SENDGRID_CONFIG = {
    apiKey: process.env.SENDGRID_API_KEY || '',
    fromEmail: process.env.SENDGRID_FROM_EMAIL || process.env.EMAIL_USER || ''
};

// EmailJS配置
const EMAILJS_CONFIG = {
    publicKey: process.env.EMAILJS_PUBLIC_KEY || '',
    privateKey: process.env.EMAILJS_PRIVATE_KEY || '',
    serviceId: process.env.EMAILJS_SERVICE_ID || '',
    otpTemplateId: process.env.EMAILJS_OTP_TEMPLATE_ID || '',
    orderTemplateId: process.env.EMAILJS_ORDER_TEMPLATE_ID || ''
};

// 初始化SendGrid（如果配置了）
if (EMAIL_PROVIDER === 'sendgrid' && SENDGRID_CONFIG.apiKey) {
    sgMail.setApiKey(SENDGRID_CONFIG.apiKey);
    console.log('📧 SendGrid 已初始化');
}

// 调试：打印当前配置
console.log('========== 配置调试 ==========');
console.log('[环境变量加载的:', process.env);
console.log('EMAIL_PROVIDER:', EMAIL_PROVIDER);
console.log('EMAILJS_CONFIG.publicKey:', EMAILJS_CONFIG.publicKey?.substring(0, 8) + '...');
console.log('EMAILJS_CONFIG.serviceId:', EMAILJS_CONFIG.serviceId);
console.log('EMAILJS_CONFIG.otpTemplateId:', EMAILJS_CONFIG.otpTemplateId);
console.log('EMAILJS_CONFIG.orderTemplateId:', EMAILJS_CONFIG.orderTemplateId);
console.log('================================');

// 创建邮件传输器（nodemailer）
let mailTransporter = null;
if (EMAIL_CONFIG.user && EMAIL_CONFIG.pass && EMAIL_PROVIDER === 'nodemailer') {
    mailTransporter = nodemailer.createTransport({
        host: EMAIL_CONFIG.host,
        port: EMAIL_CONFIG.port,
        secure: false,
        auth: {
            user: EMAIL_CONFIG.user,
            pass: EMAIL_CONFIG.pass
        }
    });
    console.log('📧 Nodemailer 已初始化');
}

// ========== EmailJS 发送函数（用官方SDK） ==========
async function sendEmailJs(toEmail, templateId, templateParams) {
    console.log('========== EmailJS调试 ==========');
    console.log('[EmailJS] 开始发送邮件');
    console.log('[EmailJS] To:', toEmail);
    console.log('[EmailJS] Template ID:', templateId);
    console.log('[EmailJS] Service ID:', EMAILJS_CONFIG.serviceId);
    console.log('[EmailJS] Public Key:', EMAILJS_CONFIG.publicKey?.substring(0, 8) + '...');
    console.log('[EmailJS] Template Params:', JSON.stringify(templateParams));
    
    try {
        // 用官方SDK发送
        const response = await emailjs.send(
            EMAILJS_CONFIG.serviceId,
            templateId,
            templateParams,
            {
                publicKey: EMAILJS_CONFIG.publicKey,
                privateKey: EMAILJS_CONFIG.privateKey
            }
        );
        
        console.log('[EmailJS] 响应状态:', response.status);
        console.log('[EmailJS] 邮件发送成功!');
        console.log('================================');
        
        return { success: true, message: '邮件发送成功，请查看您的邮箱' };
        
    } catch (error) {
        console.error('[EmailJS] 发送失败!');
        console.error('[EmailJS] 错误信息:', error.message);
        if (error.text) {
            console.error('[EmailJS] 错误详情:', error.text);
        }
        console.error('================================');
        
        return { 
            success: false, 
            message: '邮件发送失败: ' + (error.text || error.message)
        };
    }
}

// ========== 统一邮件发送函数 ==========
async function sendEmail(toEmail, subject, htmlContent, textContent = '', templateParams = null) {
    try {
        // 优先使用EmailJS
        if (EMAIL_PROVIDER === 'emailjs' && 
            EMAILJS_CONFIG.publicKey && 
            EMAILJS_CONFIG.serviceId) {
            
            // 如果是验证码，用OTP模板
            let templateId = EMAILJS_CONFIG.otpTemplateId || EMAILJS_CONFIG.orderTemplateId;
            
            // 如果提供了模板参数，用EmailJS发送
            if (templateParams) {
                const result = await sendEmailJs(toEmail, templateId, templateParams);
                return result;
            }
        }
        
        // 其次使用SendGrid
        if (EMAIL_PROVIDER === 'sendgrid' && SENDGRID_CONFIG.apiKey && SENDGRID_CONFIG.fromEmail) {
            const msg = {
                to: toEmail,
                from: SENDGRID_CONFIG.fromEmail,
                subject: subject,
                text: textContent || htmlContent.replace(/<[^>]*>/g, ''),
                html: htmlContent
            };
            
            await sgMail.send(msg);
            console.log(`📧 SendGrid邮件已发送到: ${toEmail}`);
            return { success: true, message: '邮件发送成功' };
        }
        
        // 再次使用Nodemailer
        else if (mailTransporter) {
            const mailOptions = {
                from: `KDX商城 <${EMAIL_CONFIG.user}>`,
                to: toEmail,
                subject: subject,
                text: textContent || htmlContent.replace(/<[^>]*>/g, ''),
                html: htmlContent
            };
            
            await mailTransporter.sendMail(mailOptions);
            console.log(`📧 Nodemailer邮件已发送到: ${toEmail}`);
            return { success: true, message: '邮件发送成功' };
        }
        
        // 没有配置邮件服务
        console.log('⚠️  邮件服务未配置，跳过发送邮件');
        return { success: false, message: '邮件服务未配置' };
        
    } catch (error) {
        console.error('❌ 邮件发送失败:', error);
        
        if (error.response) {
            console.error('SendGrid错误详情:', error.response.body);
        }
        
        return { success: false, message: '邮件发送失败: ' + (error.message || '未知错误') };
    }
}

// ========== 邮箱验证码发送（只使用EmailJS） ==========
async function sendVerificationCodeByEmail(toEmail, code, type = 'login') {
    // 必须使用EmailJS，不提供其他方式
    if (!EMAILJS_CONFIG.publicKey ||
        !EMAILJS_CONFIG.serviceId ||
        !EMAILJS_CONFIG.otpTemplateId) {
        throw new Error('EmailJS配置不完整，请检查.env文件');
    }
    
    // 准备EmailJS模板参数
    const templateParams = {
        to_email: toEmail,
        code: code,
        type: type === 'login' ? '登录' : (type === 'register' ? '注册' : '重置密码')
    };
    
    console.log(`[EmailJS] 发送验证码到 ${toEmail}，类型: ${type}`);
    
    // 只使用EmailJS发送
    const result = await sendEmailJs(toEmail, EMAILJS_CONFIG.otpTemplateId, templateParams);
    
    if (!result.success) {
        throw new Error('EmailJS发送失败，请检查配置');
    }
    
    return result;
}

// ========== 订单状态通知 ==========
async function sendOrderNotification(order, status, toEmail, toPhone = null) {
    const notifications = [];

    // 发送邮箱通知
    if (toEmail) {
        const emailResult = await sendOrderEmail(order, status, toEmail);
        notifications.push({ type: 'email', ...emailResult });
    }

    // 发送短信通知（如果配置了短信服务）
    if (toPhone) {
        const smsResult = await sendOrderSms(order, status, toPhone);
        if (smsResult.success) {
            notifications.push({ type: 'sms', ...smsResult });
        }
    }

    return {
        success: notifications.length > 0,
        notifications: notifications
    };
}

// 发送订单邮件
async function sendOrderEmail(order, status, toEmail) {
    let subject = '';
    let statusText = '';
    let statusColor = '';
    let statusIcon = '';

    switch (status) {
        case 'created':
            subject = '【KDX商城】订单创建成功';
            statusText = '订单已创建，等待付款';
            statusColor = '#667eea';
            statusIcon = '📦';
            break;
        case 'paid':
            subject = '【KDX商城】订单付款成功';
            statusText = '订单已付款，正在处理';
            statusColor = '#11998e';
            statusIcon = '✅';
            break;
        case 'shipped':
            subject = '【KDX商城】订单已发货';
            statusText = '您的订单已发货';
            statusColor = '#f59e0b';
            statusIcon = '🚚';
            break;
        case 'completed':
            subject = '【KDX商城】订单已完成';
            statusText = '订单已完成，感谢您的购买';
            statusColor = '#06b6d4';
            statusIcon = '🎉';
            break;
        case 'cancelled':
            subject = '【KDX商城】订单已取消';
            statusText = '订单已取消';
            statusColor = '#ef4444';
            statusIcon = '❌';
            break;
        case 'refunded':
            subject = '【KDX商城】退款处理通知';
            statusText = '退款申请已处理';
            statusColor = '#6b7280';
            statusIcon = '💸';
            break;
        default:
            subject = '【KDX商城】订单状态更新';
            statusText = '订单状态有更新';
            statusColor = '#374151';
            statusIcon = '📋';
    }

    const productsList = order.products ? order.products.map(p => `
        <tr>
            <td style="padding: 15px; border-bottom: 1px solid #eee; text-align: left;">${p.name || '商品'}</td>
            <td style="padding: 15px; border-bottom: 1px solid #eee; text-align: center;">${p.quantity || 1}</td>
            <td style="padding: 15px; border-bottom: 1px solid #eee; text-align: right;">¥${(p.price || 0).toFixed(2)}</td>
        </tr>
    `).join('') : '';

    const htmlContent = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
                <h1 style="color: white; margin: 0; font-size: 24px;">${statusIcon} KDX商城</h1>
                <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">订单状态通知</p>
            </div>
            <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 12px 12px;">
                <div style="background: ${statusColor}15; padding: 20px; border-left: 4px solid ${statusColor}; border-radius: 8px; margin-bottom: 25px;">
                    <p style="color: ${statusColor}; margin: 0; font-weight: 600; font-size: 16px;">${statusText}</p>
                </div>
                
                <div style="background: white; padding: 25px; border-radius: 10px;">
                    <p style="margin: 0 0 15px 0; color: #333;">
                        <strong>订单号：</strong> <span style="color: #667eea;">${order.id || '未知'}</span>
                    </p>
                    <p style="margin: 0 0 25px 0; color: #666; font-size: 14px;">
                        <strong>下单时间：</strong> ${new Date(order.createdAt || Date.now()).toLocaleString('zh-CN')}
                    </p>
                    
                    <h3 style="margin: 0 0 15px 0; color: #333; border-bottom: 2px solid #eee; padding-bottom: 10px;">📋 商品清单</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #f8f9fa;">
                                <th style="padding: 12px; text-align: left; color: #666;">商品</th>
                                <th style="padding: 12px; text-align: center; color: #666;">数量</th>
                                <th style="padding: 12px; text-align: right; color: #666;">单价</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${productsList}
                        </tbody>
                    </table>
                    
                    <div style="margin-top: 25px; padding-top: 20px; border-top: 2px solid #eee; text-align: right;">
                        <p style="margin: 0; color: #666;">
                            订单总额：<span style="color: #ef4444; font-size: 28px; font-weight: bold; margin-left: 10px;">¥${(order.total || 0).toFixed(2)}</span>
                        </p>
                    </div>
                </div>
                
                <div style="margin-top: 25px; text-align: center;">
                    <p style="color: #999; font-size: 14px; margin: 0;">如有问题，请随时联系客服</p>
                    <p style="color: #ccc; font-size: 12px; margin-top: 10px;">这是一封自动发送的邮件，请勿直接回复</p>
                </div>
            </div>
        </div>
    `;

    return await sendEmail(toEmail, subject, htmlContent);
}

// 发送订单短信（占位函数，实际需要集成短信服务）
async function sendOrderSms(order, status, toPhone) {
    let message = '';

    switch (status) {
        case 'created':
            message = `【KDX商城】您的订单 ${order.id} 已创建成功，总额 ¥${(order.total || 0).toFixed(2)}，请尽快付款。`;
            break;
        case 'paid':
            message = `【KDX商城】您的订单 ${order.id} 付款成功，我们会尽快为您发货！`;
            break;
        case 'shipped':
            message = `【KDX商城】您的订单 ${order.id} 已发货，请留意查收！`;
            break;
        case 'completed':
            message = `【KDX商城】您的订单 ${order.id} 已完成，感谢您的购买！`;
            break;
        case 'cancelled':
            message = `【KDX商城】您的订单 ${order.id} 已取消。如有问题请联系客服。`;
            break;
        case 'refunded':
            message = `【KDX商城】您的订单 ${order.id} 退款已处理，请注意查收。`;
            break;
        default:
            message = `【KDX商城】您的订单 ${order.id} 状态有更新，请查看详情。`;
    }

    console.log(`📱 [订单短信] 模拟发送到 ${toPhone}: ${message}`);
    
    // 这里可以集成实际的短信服务
    return { success: true, message: '短信通知已发送（模拟）' };
}

// ========== 退款通知 ==========
async function sendRefundNotification(refund, toEmail, toPhone = null) {
    const notifications = [];

    if (toEmail) {
        const emailResult = await sendRefundEmail(refund, toEmail);
        notifications.push({ type: 'email', ...emailResult });
    }

    if (toPhone) {
        const smsResult = await sendRefundSms(refund, toPhone);
        if (smsResult.success) {
            notifications.push({ type: 'sms', ...smsResult });
        }
    }

    return {
        success: notifications.length > 0,
        notifications: notifications
    };
}

async function sendRefundEmail(refund, toEmail) {
    const htmlContent = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
                <h1 style="color: white; margin: 0; font-size: 24px;">💸 KDX商城</h1>
                <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">退款处理通知</p>
            </div>
            <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 12px 12px;">
                <div style="background: #fffbeb; padding: 20px; border-left: 4px solid #f59e0b; border-radius: 8px; margin-bottom: 25px;">
                    <p style="color: #d97706; margin: 0; font-weight: 600;">您的退款申请已收到，我们正在处理中</p>
                </div>
                
                <div style="background: white; padding: 25px; border-radius: 10px;">
                    <p style="margin: 0 0 15px 0; color: #333;">
                        <strong>退款单号：</strong> <span style="color: #f59e0b;">${refund.id || '未知'}</span>
                    </p>
                    <p style="margin: 0 0 15px 0; color: #333;">
                        <strong>订单号：</strong> ${refund.orderId || '未知'}
                    </p>
                    <p style="margin: 0 0 15px 0; color: #333;">
                        <strong>退款金额：</strong> <span style="color: #ef4444; font-size: 22px; font-weight: bold;">¥${(refund.amount || 0).toFixed(2)}</span>
                    </p>
                    <p style="margin: 0 0 15px 0; color: #333;">
                        <strong>退款原因：</strong> ${refund.reason || '未说明'}
                    </p>
                    <p style="margin: 0 0 15px 0; color: #666; font-size: 14px;">
                        <strong>申请时间：</strong> ${new Date(refund.createdAt || Date.now()).toLocaleString('zh-CN')}
                    </p>
                    <p style="margin: 0; color: #666; font-size: 14px;">
                        <strong>当前状态：</strong> <span style="color: #f59e0b; font-weight: 600;">${refund.status === 'pending' ? '等待处理' : '处理中'}</span>
                    </p>
                </div>
                
                <div style="margin-top: 25px; text-align: center;">
                    <p style="color: #666; font-size: 14px; margin: 0;">我们会尽快处理您的退款申请，处理完成后会再通知您</p>
                    <p style="color: #ccc; font-size: 12px; margin-top: 10px;">这是一封自动发送的邮件，请勿直接回复</p>
                </div>
            </div>
        </div>
    `;

    return await sendEmail(toEmail, '【KDX商城】退款申请通知', htmlContent);
}

async function sendRefundSms(refund, toPhone) {
    const message = `【KDX商城】您的退款申请已提交，退款单号 ${refund.id}，金额 ¥${(refund.amount || 0).toFixed(2)}，我们会尽快处理。`;
    console.log(`📱 [退款短信] 模拟发送到 ${toPhone}: ${message}`);
    return { success: true, message: '短信通知已发送（模拟）' };
}

// 导出函数
module.exports = {
    sendVerificationCodeByEmail,
    sendOrderNotification,
    sendRefundNotification,
    mailTransporter,
    EMAIL_CONFIG,
    sendEmail,
    EMAIL_PROVIDER,
    SENDGRID_CONFIG
};
