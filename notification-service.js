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

console.log('📧 邮件服务提供商:', EMAIL_PROVIDER);