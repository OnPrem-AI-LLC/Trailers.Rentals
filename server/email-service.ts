// Email service using SendGrid integration
import sgMail from '@sendgrid/mail';
import { type ContactRequest } from '@shared/schema';

if (!process.env.SENDGRID_API_KEY) {
  throw new Error("SENDGRID_API_KEY environment variable must be set");
}

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export async function sendContactNotification(contactRequest: ContactRequest): Promise<boolean> {
  try {
    const emailContent = `
New Contact Form Submission - Deluxe Logistics Inc.

Customer Information:
- Name: ${contactRequest.firstName} ${contactRequest.lastName}
- Company: ${contactRequest.companyName}
- Email: ${contactRequest.businessEmail}
- Phone: ${contactRequest.phoneNumber}
- DOT Number: ${contactRequest.dotNumber}
- Primary Location: ${contactRequest.primaryLocation}
- Current Customer: ${contactRequest.currentCustomer}
- Interests: ${contactRequest.interests.join(', ')}
- Newsletter Signup: ${contactRequest.newsletter === 'true' ? 'Yes' : 'No'}

${contactRequest.message ? `Message: ${contactRequest.message}` : 'No additional message provided.'}

Submitted on: ${contactRequest.createdAt.toLocaleString()}

Please follow up with this customer within 24 hours.
`;

    const msg = {
      to: 'info@deluxelogistics.com', // Default recipient email
      from: 'noreply@deluxelogistics.com', // Sender email (should be verified domain)
      subject: `New Contact Form Submission - ${contactRequest.companyName}`,
      text: emailContent,
      html: emailContent.replace(/\n/g, '<br>'),
    };

    await sgMail.send(msg);
    console.log('Contact notification email sent successfully');
    return true;
  } catch (error) {
    console.error('SendGrid email error:', error);
    return false;
  }
}

export async function sendCustomerConfirmation(contactRequest: ContactRequest): Promise<boolean> {
  try {
    const emailContent = `
Dear ${contactRequest.firstName} ${contactRequest.lastName},

Thank you for your interest in Deluxe Logistics Inc.! We have received your request for information and a member of our team will contact you within 24 hours.

Your submission details:
- Company: ${contactRequest.companyName}
- Primary Location: ${contactRequest.primaryLocation}
- Interests: ${contactRequest.interests.join(', ')}

In the meantime, feel free to explore our services and learn more about our 65,000+ fleet of trailers available across 40+ locations nationwide.

Best regards,
The Deluxe Logistics Team

Phone: (555) 123-4567
Email: info@deluxelogistics.com
Website: www.deluxelogistics.com
`;

    const msg = {
      to: contactRequest.businessEmail,
      from: 'noreply@deluxelogistics.com',
      subject: 'Thank you for contacting Deluxe Logistics Inc.',
      text: emailContent,
      html: emailContent.replace(/\n/g, '<br>'),
    };

    await sgMail.send(msg);
    console.log('Customer confirmation email sent successfully');
    return true;
  } catch (error) {
    console.error('SendGrid customer confirmation email error:', error);
    return false;
  }
}